// Guided co-creation in three steps: describe it, check the basics, review the draft.
// The author gives direction; everything else is drafted and shown in plain words, with
// questions only for what could not be worked out. Every step is derived from one state, so a
// change to the basics flows into the draft while the author's own edits stay. The flow autosaves.
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
import { Button, Callout, Field, Pill, Seg, StylePill, Switch, TextInput, TokenArea } from './ui.jsx';
import { LocationFields, useSample } from './Tailoring.jsx';
import { writeFlowDraft } from './store.js';
import { clone } from '../engine/clone.js';
import { INTERACTION_TYPES, CHANNELS, mixOf, textVars } from '../engine/decisions.js';
import { MixMeter } from './sections/Decisions.jsx';

const STEPS = [
  { id: 'describe', label: 'Describe it', short: 'Describe' },
  { id: 'basics', label: 'Check the basics', short: 'Basics' },
  { id: 'review', label: 'Review the draft', short: 'Review' },
];
// Drafts saved by the earlier six-step flow resume on the matching new step.
const OLD_STEP = [0, 1, 2, 2, 2, 2];

const LENGTH_OF = Object.fromEntries(SESSION_LENGTHS.map((l) => [l.id, l]));
const GENIE_TIMEOUT_MS = 20000;
const EMPTY_BRIEF = { instructions: '', outcomes: [], outcomeText: '', constraints: '', chips: [] };
const DEFAULT_SETTINGS = { name: '', audience: ['First-time managers'], length: 'long', difficulty: 'standard', outcomes: ['adapt'], noFiring: false, formal: false, localNames: false, letterVariant: 0, namesVariant: 0, target: null, targetFrom: null, weeks: null, dealValue: null, currency: null, openMix: 30, dpTypes: {} };
const DRIVERS = ['orgName', 'industry', 'customIndustry', 'offeringType', 'customerType', 'country', 'customCountry', 'city'];
const briefText = (b) => [b.instructions, b.outcomeText, b.constraints, ...(b.outcomes || []), ...(b.chips || [])].join('|');

export default function CreateFlow({ templateId, resume, onCancel, onCreate }) {
  const template = TEMPLATES[templateId];
  const ctx = template.contextualize;
  const base = useMemo(() => template.create(), [template]);
  const sample = useSample();
  const r = resume || {};

  const flowV = r.flow === 3;
  const [step, setStep] = useState(flowV ? r.step || 0 : OLD_STEP[r.step || 0] || 0);
  const [reached, setReached] = useState(flowV ? r.reached || 0 : OLD_STEP[r.reached || 0] || 0);
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
  const snapshot = { flow: 3, templateId, step, reached, brief, readOf, sources, asked, resolved, readBy, profile, settings, overrides, found, stale };
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
    const dec = TEMPLATES[templateId]?.decisions;
    if (def.decisions && dec) {
      const mix = settings.openMix ?? 30;
      def.decisions.mix = { ...(def.decisions.mix || {}), open: mix };
      if (mix !== 30) def.decisions.points = dec.applyMix(def.decisions.points, mix, def);
      for (const [id, type] of Object.entries(settings.dpTypes || {})) {
        const i = def.decisions.points.findIndex((p) => p.id === id);
        if (i >= 0 && def.decisions.points[i].type !== type) def.decisions.points[i] = { ...dec.convertType(def.decisions.points[i], type, def), lockType: true };
        else if (i >= 0) def.decisions.points[i].lockType = true;
      }
    }
    return def;
  }, [base, ctx, profile, settings, overrides, specifics, templateId]);

  const notes = [brief.instructions, brief.outcomeText && `Outcome: ${brief.outcomeText}`, brief.constraints && `Constraints: ${brief.constraints}`, settings.formal && 'Use a formal tone.'].filter(Boolean).join('\n');

  // ---------- reading the brief ----------
  const go = (i) => {
    setStep(i);
    setReached((x) => Math.max(x, i));
    document.querySelector('.main')?.scrollTo({ top: 0 });
  };

  const finishRead = (result, from, withBrief) => {
    // Keep anything the author already set by hand on the basics step.
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
    if (STEPS[step].id !== 'review' || calibration?.key === calKey) return;
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
  const canContinue = current !== 'basics' || unanswered.length === 0;
  const briefChanged = readOf !== null && readOf !== briefText(brief);
  const genie = sample ? true : false;

  const next = () => go(step + 1);
  const create = async () => {
    setBusy('create');
    const balance = await runBalanceAsync(draft, { runs: 10, learners: 30 });
    onCreate(draft, 'overview', { ...balance, at: Date.now() + 1000, target: draft.funnel.target }, brief);
  };

  return (
    <main className="main flow">
      <div className="page stack" style={{ '--gap': '20px', maxWidth: 880 }}>
        <Stepper step={step} reached={reached} go={go} />

        {genieError && <Callout tone="warn" icon="!">{genieError}</Callout>}
        {history.length > 0 && current === 'review' && (
          <div className="undo-bar" role="status">
            <span>You {history.at(-1).label}.</span>
            <Button size="sm" onClick={undo}>Undo</Button>
          </div>
        )}

        {current === 'describe' && <DescribeStep brief={brief} setBrief={setBrief} locked={!!reading} />}
        {current === 'basics' && (
          <BasicsStep {...{ profile, settings, sources, asked, answered, found, resolved, readBy, stale, changeProfile, setS, setResolved, mark, overrides, draft, brief, briefChanged }}
            onEditBrief={() => go(0)}
            onReread={() => read()}
            onStale={(action, keys) => {
              if (action === 'refresh') { remember('refreshed your edits for the new details'); setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))); }
              setStale((st) => (st ? { ...st, keys: st.keys.filter((k) => !keys.includes(k)) } : st));
            }}
          />
        )}
        {current === 'review' && (
          <ReviewStep {...{ draft, profile, settings, setS, overrides, found, calibration, genie, busy, editText, editTarget }}
            onEditBasics={() => go(1)}
            onNewLetter={() => {
              if (genie) return regenerate(itemsFor((t) => t.ref.field === 'welcome'), 'rewrote the letter', { replaceEdited: true });
              remember('switched to another letter');
              setSettings((s) => ({ ...s, letterVariant: s.letterVariant + 1 }));
              return dropOverrides((t) => t.ref?.field === 'welcome');
            }}
            onRewriteBrief={() => regenerate(itemsFor((t) => t.ref.field === 'overview' || t.ref.field === 'target'), 'rewrote the product brief', { replaceEdited: true })}
            onRewriteStages={() => regenerate(itemsFor((t) => !!t.ref.stageId), 'rewrote the stage descriptions')}
            onNewNames={() => { remember('picked new names'); setSettings((s) => ({ ...s, namesVariant: s.namesVariant + 1, localNames: true })); dropOverrides((t) => t.kind === 'actor' && t.field === 'name'); }}
            onRewriteEvents={() => regenerate(itemsFor((t) => !!t.ref.eventId && draft.events.find((e) => e.id === t.ref.eventId)?.enabled), 'rewrote the events')}
            onRewriteBios={() => regenerate(itemsFor((t) => !!t.ref.actorId && draft.actors.find((a) => a.id === t.ref.actorId)?.pool === 'team'), 'rewrote the backgrounds')}
          />
        )}

        <div className="flow-actions">
          <Button variant="ghost" onClick={step === 0 ? onCancel : () => go(step - 1)}>{step === 0 ? (hasWork ? 'Save and exit' : 'Cancel') : 'Back'}</Button>
          <div className="row">
            {current === 'describe' && (reading ? (
              <>
                <ReadingTimer started={reading.started} />
                <Button onClick={stopReading}>Stop</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => read(EMPTY_BRIEF)}>Skip, fill in a form instead</Button>
                {readOf !== null && !briefChanged
                  ? <Button variant="primary" size="lg" onClick={next}>Continue</Button>
                  : <Button variant="primary" size="lg" disabled={!brief.instructions.trim()} onClick={() => read()}>Draft my simulation</Button>}
              </>
            ))}
            {current === 'basics' && (
              <Button variant="primary" size="lg" disabled={!canContinue} onClick={next}>
                {canContinue ? 'See the draft' : `Answer ${unanswered.length} question${unanswered.length === 1 ? '' : 's'} first`}
              </Button>
            )}
            {current === 'review' && (
              <Button variant="primary" size="lg" disabled={busy === 'create'} onClick={create}>
                {busy === 'create' ? 'Creating…' : 'Create simulation'}
              </Button>
            )}
          </div>
        </div>
        <p className="small muted" style={{ textAlign: 'right', marginTop: -10 }}>
          {saveFailed ? <strong style={{ color: 'var(--bad)' }}>This browser is not saving your progress.</strong> : hasWork ? 'Your progress is saved as you go. You can leave and resume from Simulations.' : ''}
        </p>
      </div>
    </main>
  );
}

// ---------- shared pieces ----------

function Stepper({ step, reached, go }) {
  return (
    <ol className="stepper" aria-label="Steps">
      {STEPS.map((s, i) => {
        const state = i === step ? 'current' : i < step || i <= reached ? 'done' : 'todo';
        return (
          <li key={s.id} className={`stepper-item ${state}`}>
            <button type="button" disabled={i > reached} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
              <span className="stepper-num">{i < step ? '✓' : i + 1}</span>
              <span className="stepper-long">{s.label}</span>
              <span className="stepper-short" aria-hidden="true">{s.short}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ReadingTimer({ started }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const s = Math.floor((now - started) / 1000);
  return <span className="small muted num" role="status" aria-live="polite">Genie is reading… {s}s</span>;
}

const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const summary = (p) => [p.orgName, industryPack(p).label, p.city, locationPack(p).label].filter(Boolean).join(', ');

// ---------- step 1: describe ----------

function DescribeStep({ brief, setBrief, locked }) {
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  const toggle = (k, id) => setBrief((b) => ({ ...b, [k]: b[k].includes(id) ? b[k].filter((x) => x !== id) : [...b[k], id] }));
  const extras = brief.outcomes.length + brief.chips.length + (brief.outcomeText ? 1 : 0) + (brief.constraints ? 1 : 0);
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div>
        <h1>What should the simulation be about?</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '62ch' }}>In a few sentences: who it is for, your organization, what their team sells and where. We draft the whole simulation from this, and you check it next.</p>
      </div>
      <fieldset disabled={locked} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0, '--gap': '12px' }}>
        <label className="sr-only" htmlFor="b-ins">Describe the simulation</label>
        <textarea id="b-ins" className="textarea brief-box" rows={5} value={brief.instructions} readOnly={locked} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. A 60-minute simulation for first-time sales managers at Meridian Bank in Mumbai. Their teams sell home loans to families, and new managers struggle to coach low performers." />
        <div className="row small" style={{ '--gap': '6px' }}>
          <span className="muted">Or start from an example:</span>
          {EXAMPLE_BRIEFS.map((ex) => <button key={ex.label} type="button" className="btn sm ghost" onClick={() => setBrief((b) => ({ ...b, instructions: ex.instructions, outcomeText: ex.outcomeText, constraints: ex.constraints }))}>{ex.label}</button>)}
        </div>
        <details className="more" open={extras > 0 || undefined}>
          <summary>Goals and constraints (optional){extras ? ` · ${extras} added` : ''}</summary>
          <div className="stack" style={{ '--gap': '12px', marginTop: 12 }}>
            <div className="field">
              <span className="label">Learners should be able to</span>
              <div className="row" style={{ '--gap': '6px' }}>
                {OUTCOMES.map((o) => <button key={o.id} type="button" className={`btn sm ${brief.outcomes.includes(o.id) ? 'primary' : ''}`} aria-pressed={brief.outcomes.includes(o.id)} onClick={() => toggle('outcomes', o.id)}>{o.label}</button>)}
              </div>
            </div>
            <div className="field">
              <span className="label">Keep in mind</span>
              <div className="row" style={{ '--gap': '6px' }}>
                {CONSTRAINT_CHIPS.map((c) => <button key={c.id} type="button" className={`btn sm ${brief.chips.includes(c.id) ? 'primary' : ''}`} aria-pressed={brief.chips.includes(c.id)} onClick={() => toggle('chips', c.id)}>{c.label}</button>)}
              </div>
              <input className="input" aria-label="Anything else to keep in mind" placeholder="Anything else, e.g. avoid real brand names" value={brief.constraints} onChange={(e) => set('constraints', e.target.value)} />
            </div>
          </div>
        </details>
      </fieldset>
    </div>
  );
}

// ---------- step 2: check the basics ----------

const QUESTIONS = {
  orgName: 'What is your organization called?',
  industry: 'Which industry is it in?',
  country: 'Where does the team work?',
  offeringName: 'What is the product or service called?',
};

function BasicsStep({ profile, settings, sources, asked, answered, found, resolved, readBy, stale, changeProfile, setS, setResolved, mark, overrides, draft, brief, briefChanged, onEditBrief, onReread, onStale }) {
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  const need = (k) => asked.includes(k) && !answered(k);
  const open = asked.filter((k) => !k.startsWith('conflict:'));
  const conflicts = (found.conflicts || []).filter((c) => asked.includes(`conflict:${c.key}`));
  const sug = { ...(found.suggestions || {}), orgName: pack.sampleOrg || found.suggestions?.orgName, offeringName: (pack[profile.offeringType] || pack.product)?.name || suggestOfferingName(profile) };
  const unused = (found.specifics || []).filter((x) => !x.used);
  const staleItems = stale?.keys?.length ? stale.keys.filter((k) => overrides[k]).map((k) => ({ k, label: labelFor(draft, overrides[k]) })) : [];
  const setIndustry = (v) => {
    // Picking an industry must not answer other open questions with its sample names.
    const next = suggestProfile({ ...profile, industry: v }, 'industry', profile);
    for (const k of ['orgName', 'offeringName']) if (asked.includes(k)) next[k] = profile[k];
    changeProfile(next, ['industry']);
  };
  const guess = (k) => !['brief', 'you'].includes(sources[k]);
  const count = open.length + conflicts.length;
  const left = open.filter(need).length + conflicts.filter((c) => !resolved[c.key]).length;

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div>
        <h1>Check the basics</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '62ch' }}>
          {readBy === 'none' ? 'Fill in the essentials; everything else is drafted for you.' : 'Here is what we took from your description.'} {count ? `We need ${count === 1 ? 'one answer' : `${count} answers`} from you, then you can see the full draft.` : 'Change anything that is not right, then see the full draft.'}
        </p>
      </div>

      {readBy !== 'none' && (
        <div className="brief-quote">
          <span className="grow">“{brief.instructions.length > 220 ? `${brief.instructions.slice(0, 220)}…` : brief.instructions}”</span>
          <span className="row nowrap">
            {briefChanged && <Button size="sm" variant="primary" onClick={onReread}>Use the changed description</Button>}
            <Button size="sm" variant="ghost" onClick={onEditBrief}>Edit description</Button>
          </span>
        </div>
      )}

      {(found.notes || []).map((n, i) => <Callout key={i} tone="warn" icon={n.kind === 'question' ? '?' : '!'}>{n.kind === 'question' ? <>Genie asks: {n.text}</> : n.text}</Callout>)}

      {staleItems.length > 0 && (
        <div className="card stack" style={{ borderColor: 'var(--warn)' }}>
          <strong>You edited {staleItems.length} item{staleItems.length === 1 ? '' : 's'} for {stale.was}</strong>
          <p className="small ink2">The details have changed since. Keep your edits, or let them follow the new details.</p>
          <div className="row"><Button size="sm" onClick={() => onStale('keep', stale.keys)}>Keep my edits</Button><Button size="sm" variant="primary" onClick={() => onStale('refresh', stale.keys)}>Update them</Button></div>
        </div>
      )}

      {count > 0 && (
        <section className="card stack questions" aria-label="Questions">
          <div className="row spread"><h2 style={{ fontSize: 18 }}>{left ? `${left} question${left === 1 ? '' : 's'} for you` : 'All answered'}</h2>{!left && <Pill tone="good">Done</Pill>}</div>
          {asked.includes('orgName') && (
            <div className="q">
              <TextInput label={QUESTIONS.orgName} value={profile.orgName} onChange={(v) => changeProfile({ ...profile, orgName: v }, v.trim() ? ['orgName'] : [])} placeholder="Your organization, or a made-up name" />
              {sug.orgName && !profile.orgName?.trim() && <button type="button" className="link-btn" onClick={() => changeProfile({ ...profile, orgName: sug.orgName }, ['orgName'])}>Use a sample name: {sug.orgName}</button>}
            </div>
          )}
          {asked.includes('industry') && (
            <div className="q">
              <Field label={QUESTIONS.industry} id="q-ind">
                <select id="q-ind" className="select" value={sources.industry === 'you' ? profile.industry : ''} onChange={(e) => setIndustry(e.target.value)}>
                  <option value="" disabled>Choose an industry</option>
                  {Object.entries(INDUSTRIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  <option value="other">Something else</option>
                </select>
              </Field>
              {sources.industry === 'you' && profile.industry === 'other' && <TextInput label="Describe it in a few words" value={profile.customIndustry} onChange={(v) => changeProfile({ ...profile, customIndustry: v }, ['industry'])} placeholder="e.g. Solar energy" />}
            </div>
          )}
          {asked.includes('offeringName') && (
            <div className="q">
              <TextInput label={`What is the ${profile.offeringType === 'service' ? 'service' : 'product'} the team sells called?`} value={profile.offeringName} onChange={(v) => changeProfile({ ...profile, offeringName: v }, v.trim() ? ['offeringName'] : [])} placeholder="A real or made-up name" />
              {sug.offeringName && !profile.offeringName?.trim() && <button type="button" className="link-btn" onClick={() => changeProfile({ ...profile, offeringName: sug.offeringName }, ['offeringName'])}>Use a suggested name: {sug.offeringName}</button>}
            </div>
          )}
          {asked.includes('country') && (
            <div className="q stack" style={{ '--gap': '8px' }}>
              <span className="label">{sug.country ? 'Your description mentions more than one place. Where does the team work?' : QUESTIONS.country}</span>
              {sug.country && (
                <div className="row" style={{ '--gap': '6px' }}>
                  {sug.country.map((o) => <Button key={o.label} size="sm" variant={profile.country === o.country && answered('country') ? 'primary' : ''} onClick={() => changeProfile({ ...profile, country: o.country, city: o.city }, ['country'])}>{o.label}</Button>)}
                </div>
              )}
              <LocationFields profile={profile} onChange={(p) => changeProfile(p, ['country'])} setDriver={(k, v) => changeProfile(suggestProfile({ ...profile, [k]: v }, k, profile), ['country'])} />
            </div>
          )}
          {conflicts.map((c) => (
            <div key={c.key} className="q stack" style={{ '--gap': '8px' }}>
              <span className="label">{c.question.replace(/Your brief/g, 'Your description')}</span>
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
        </section>
      )}

      <section className="card basics" aria-label="The basics">
        <Row label="Organization" value={profile.orgName || 'Not set yet'} guessed={guess('orgName')} hidden={asked.includes('orgName')}>
          <TextInput label="Organization" value={profile.orgName} onChange={(v) => changeProfile({ ...profile, orgName: v }, ['orgName'])} />
        </Row>
        <Row label="Industry" value={pack.label} guessed={guess('industry')} hidden={asked.includes('industry')}>
          <Field label="Industry" id="b-ind">
            <select id="b-ind" className="select" value={profile.industry} onChange={(e) => setIndustry(e.target.value)}>
              {Object.entries(INDUSTRIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
              <option value="other">Something else</option>
            </select>
          </Field>
          {profile.industry === 'other' && <TextInput label="Describe it in a few words" value={profile.customIndustry} onChange={(v) => changeProfile({ ...profile, customIndustry: v }, ['industry'])} />}
        </Row>
        <Row label="The team sells" value={`${profile.offeringName ? `${profile.offeringName}, ` : ''}${profile.offeringType === 'service' ? 'a service' : 'a product'} for ${profile.customerType === 'b2c' ? 'consumers' : 'businesses'}${profile.offeringName ? '' : ' (name not set yet)'}`} guessed={guess('offeringName') || guess('customerType')}>
          <div className="grid cols-2">
            <TextInput label={profile.offeringType === 'service' ? 'Service name' : 'Product name'} value={profile.offeringName} onChange={(v) => changeProfile({ ...profile, offeringName: v }, ['offeringName'])} />
            <TextInput label="What kind of thing is it?" hint="e.g. home loan, cardiac monitor, managed IT service" value={profile.offeringCategory} onChange={(v) => changeProfile({ ...profile, offeringCategory: v }, ['offeringCategory'])} />
          </div>
          <div className="grid cols-2">
            <Field label="It is" id="b-off"><Seg label="Product or service" value={profile.offeringType} onChange={(v) => changeProfile(suggestProfile({ ...profile, offeringType: v }, 'offeringType', profile), ['offeringType'])} options={[{ value: 'product', label: 'A product' }, { value: 'service', label: 'A service' }]} /></Field>
            <Field label="Bought by" id="b-cust"><Seg label="Who buys it" value={profile.customerType} onChange={(v) => changeProfile({ ...profile, customerType: v }, ['customerType'])} options={[{ value: 'b2b', label: 'Businesses' }, { value: 'b2c', label: 'Consumers' }]} /></Field>
          </div>
        </Row>
        <Row label="Where the team works" value={`${profile.city ? `${profile.city}, ` : ''}${loc.label}`} guessed={guess('country') || guess('city')} hidden={asked.includes('country')}>
          <LocationFields profile={profile} onChange={(p) => changeProfile(p, ['country', 'city'])} setDriver={(k, v) => changeProfile(suggestProfile({ ...profile, [k]: v }, k, profile), ['country'])} />
        </Row>
        <Row label="Learners" value={`${settings.audience.join(', ')}, playing the ${profile.learnerRole}`} guessed={guess('audience')}>
          <div className="field">
            <span className="label">Who will play it</span>
            <div className="row" style={{ '--gap': '6px' }}>
              {AUDIENCES.map((a) => <button key={a} type="button" className={`btn sm ${settings.audience.includes(a) ? 'primary' : ''}`} aria-pressed={settings.audience.includes(a)} onClick={() => setS({ audience: settings.audience.includes(a) ? settings.audience.filter((x) => x !== a) : [...settings.audience, a] })}>{a}</button>)}
            </div>
          </div>
          <TextInput label="Their role in the story" value={profile.learnerRole} onChange={(v) => changeProfile({ ...profile, learnerRole: v }, ['learnerRole'])} />
        </Row>
        <Row label="Length and difficulty" value={`${lengthLabel(settings)}, ${DIFFICULTY[settings.difficulty].label.toLowerCase()}`} guessed={guess('length') && guess('weeks')}>
          <div className="field">
            <span className="label">Session length</span>
            <Seg label="Session length" value={settings.weeks && !SESSION_LENGTHS.some((l) => l.weeks === settings.weeks) ? 'custom' : SESSION_LENGTHS.find((l) => (settings.weeks ? l.weeks === settings.weeks : l.id === settings.length))?.id} onChange={(v) => setS({ length: v, weeks: null })} options={SESSION_LENGTHS.map((l) => ({ value: l.id, label: l.label }))} />
          </div>
          <div className="field">
            <span className="label">Difficulty</span>
            <Seg label="Difficulty" value={settings.difficulty} onChange={(v) => setS({ difficulty: v })} options={Object.entries(DIFFICULTY).map(([id, d]) => ({ value: id, label: d.label }))} />
            <span className="hint">{DIFFICULTY[settings.difficulty].note}</span>
          </div>
        </Row>
        <Row label="How learners respond" value={`${100 - (settings.openMix ?? 30)}% choices, ${settings.openMix ?? 30}% in their own words`} guessed={false}>
          <Field label="Share of moments answered in the learner's own words">
            <Seg label="Open response share" value={settings.openMix ?? 30} onChange={(v) => setS({ openMix: v })} options={[0, 20, 30, 40, 50].map((v) => ({ value: v, label: `${v}%` }))} />
            <span className="hint">{(settings.openMix ?? 30) === 30 ? 'Recommended. Most moments are quick choices (single, multiple select, ranking, scenario); about a third ask for a written reply that is scored on reasoning, relevance and judgement.' : (settings.openMix ?? 30) > 30 ? 'More written replies: deeper practice and richer debriefs, but a longer session.' : 'Fewer written replies: faster to play, less practice at explaining decisions.'}</span>
          </Field>
        </Row>
        <Row label="The debrief focuses on" value={settings.outcomes.map((o) => OUTCOMES.find((x) => x.id === o)?.label.toLowerCase()).join('; ')} guessed={guess('outcomes')}>
          <div className="row" style={{ '--gap': '6px' }}>
            {OUTCOMES.map((o) => <button key={o.id} type="button" className={`btn sm ${settings.outcomes.includes(o.id) ? 'primary' : ''}`} aria-pressed={settings.outcomes.includes(o.id)} onClick={() => setS({ outcomes: settings.outcomes.includes(o.id) ? settings.outcomes.filter((x) => x !== o.id) : [...settings.outcomes, o.id] })}>{o.label}</button>)}
          </div>
          <Switch checked={settings.noFiring} onChange={(v) => setS({ noFiring: v })} label="Learners cannot fire team members" />
        </Row>
        {pack.generic && (
          <Row label={`Details about ${pack.label === 'Other' ? 'your industry' : pack.label.toLowerCase()}`} value={[profile.customCompetitor, profile.customPortfolio, profile.customSetback].filter(Boolean).join('; ') || 'Optional: makes events and the letter specific to your industry'} guessed={false}>
            <TextInput label="Your main competitor" placeholder="e.g. SunGrid Power" value={profile.customCompetitor || ''} onChange={(v) => changeProfile({ ...profile, customCompetitor: v })} />
            <TextInput label="Two other things you sell" placeholder="e.g. battery storage, EV chargers" value={profile.customPortfolio || ''} onChange={(v) => changeProfile({ ...profile, customPortfolio: v })} />
            <TextInput label="A setback your teams dread" hint="Becomes the crisis event in the middle of the run." placeholder="e.g. a key panel supplier goes out of business" value={profile.customSetback || ''} onChange={(v) => changeProfile({ ...profile, customSetback: v })} />
          </Row>
        )}
      </section>
      <p className="small muted">Items marked <span className="guess-mark">guessed</span> were not in your description. Check them, or change them later in the Studio.</p>

      {unused.length > 0 && (
        <Callout tone="warn" icon="!">
          <strong>Not used from your description:</strong> {unused.map((x) => `${x.label.toLowerCase()} (${x.text}). ${x.reason}`).join(' ')}
        </Callout>
      )}
    </div>
  );
}

const lengthLabel = (settings) => {
  if (settings.weeks && !SESSION_LENGTHS.some((l) => l.weeks === settings.weeks)) return `${settings.weeks} simulated weeks`;
  return (SESSION_LENGTHS.find((l) => (settings.weeks ? l.weeks === settings.weeks : l.id === settings.length)) || LENGTH_OF[settings.length]).label;
};

// One line of the basics: label, value, and a Change button that opens the fields in place.
function Row({ label, value, guessed, hidden, children }) {
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <div className={`basics-row ${open ? 'open' : ''}`}>
      <div className="basics-line">
        <span className="basics-label">{label}</span>
        <span className="basics-value">{value}{guessed && <span className="guess-mark">guessed</span>}</span>
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Done' : 'Change'}</button>
      </div>
      {open && <div className="basics-edit stack">{children}</div>}
    </div>
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

// ---------- step 3: review the draft ----------

const TABS = [
  { id: 'story', label: 'Story' },
  { id: 'team', label: 'Team' },
  { id: 'events', label: 'Events' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'fairness', label: 'Target' },
];

function ReviewStep({ draft, profile, settings, setS, overrides, found, calibration, genie, busy, editText, editTarget, onEditBasics, onNewLetter, onRewriteBrief, onRewriteStages, onNewNames, onRewriteEvents, onRewriteBios }) {
  const [tab, setTab] = useState('story');
  const edited = (ref) => overrides[`ref:${refKey(ref)}`]?.by === 'you';
  const team = draft.actors.filter((a) => a.pool === 'team');
  const events = draft.events.filter((e) => e.enabled).sort((a, b) => a.week - b.week || a.day - b.day);
  const blocking = validate(draft).filter((i) => i.severity === 'error');
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  const used = (found.specifics || []).filter((x) => x.used);
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div>
        <h1>Review your draft</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>
          <strong>{draft.meta.name}</strong>: {listOf(settings.audience).toLowerCase()} lead a team of ten at {profile.orgName} in {profile.city ? `${profile.city}, ` : ''}{loc.label}, selling {profile.offeringName}. {lengthLabel(settings)}, {draft.timeline.weeks} simulated weeks. <button type="button" className="link-btn" onClick={onEditBasics}>Change the basics</button>
        </p>
        {used.length > 0 && <p className="small muted" style={{ marginTop: 4 }}>From your description: {used.map((x) => x.text).join('; ')}.</p>}
        <p className="small muted" style={{ marginTop: 4 }}>Read each tab as your learners will. Edit anything now, or later in the Studio.</p>
      </div>

      <div className="tabs" role="tablist" aria-label="Draft">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}{t.id === 'fairness' && calibration?.pending ? ' …' : ''}</button>)}
      </div>

      {tab === 'story' && (
        <div className="stack" style={{ '--gap': '14px' }}>
          <TextBlock draft={draft} title="Welcome letter" note="The first thing learners read." textRef={{ field: 'welcome' }} edited={edited({ field: 'welcome' })} onSave={(v) => editText({ field: 'welcome' }, v)} rows={10}
            action={{ label: genie ? 'Rewrite with Genie' : 'Try another version', busy: busy === 'rewrote the letter', run: onNewLetter }} />
          <TextBlock draft={draft} title={`About ${profile.offeringName || 'the product'}`} note="Shown before the first week." textRef={{ field: 'overview' }} edited={edited({ field: 'overview' })} onSave={(v) => editText({ field: 'overview' }, v)} generic={pack.generic}
            action={genie ? { label: 'Rewrite with Genie', busy: busy === 'rewrote the product brief', run: onRewriteBrief } : null} />
          <div className="card stack">
            <div className="row spread">
              <div><h3>How the team's work flows</h3><p className="small muted">Five stages, each passing work to the next. Rename them to match how your teams talk.</p></div>
              {genie && <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRewriteStages}>{busy === 'rewrote the stage descriptions' ? 'Writing…' : 'Rewrite descriptions'}</Button>}
            </div>
            {draft.stages.map((st, i) => (
              <div key={st.id} className="stage-row">
                <span className="badge num">{i + 1}</span>
                <input className="input" aria-label={`Stage ${i + 1} name`} value={st.name} onChange={(e) => editTarget({ kind: 'stage', id: st.id, field: 'name' }, e.target.value)} />
                <p className="small ink2">{renderText(draft, st.description)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'team' && (
        <div className="card stack">
          <div className="row spread">
            <div><h3>The team the learner leads</h3><p className="small muted">Each person needs a different leadership style. Type over any name.</p></div>
            <div className="row">
              <Button size="sm" onClick={onNewNames}>Different names</Button>
              {genie && <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRewriteBios}>{busy === 'rewrote the backgrounds' ? 'Writing…' : 'Rewrite backgrounds'}</Button>}
            </div>
          </div>
          <div className="grid cols-2">
            {team.map((a) => {
              const st = a.stats[a.startStage];
              const need = desiredStyle(draft, st.s, st.m);
              return (
                <div key={a.id} className="card tight stack" style={{ '--gap': '6px' }}>
                  <div className="row spread nowrap">
                    <input className="input" style={{ fontWeight: 650, padding: '3px 6px' }} aria-label={`Name of ${a.name}`} value={a.name} onChange={(e) => editTarget({ kind: 'actor', id: a.id, field: 'name' }, e.target.value)} />
                    <StylePill def={draft} styleId={need}>Needs {draft.leadership.styles.find((s) => s.id === need)?.name}</StylePill>
                  </div>
                  <span className="small muted">{stageName(draft, a.startStage)} · {a.experience || 'experience not stated'}</span>
                  <p className="small ink2">{renderText(draft, a.bio) || 'No background yet.'}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'events' && (
        <div className="card stack">
          <div className="row spread">
            <div><h3>What happens during the run</h3><p className="small muted">Timing and impact are fixed so the simulation stays fair; the wording is yours to change.{pack.generic ? ' Some events are written for any industry.' : ''}</p></div>
            {genie && <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRewriteEvents}>{busy === 'rewrote the events' ? 'Writing…' : 'Rewrite events'}</Button>}
          </div>
          {events.map((e) => <EventRow key={e.id} draft={draft} ev={e} edited={overrides[`ref:${refKey({ eventId: e.id })}`]?.by === 'you'} onSave={(v) => editText({ eventId: e.id }, v)} />)}
          <p className="small muted">Plus {draft.triggers.filter((t) => t.enabled).length} consequences that follow from the learner's own decisions, such as a resignation after poor leadership.</p>
        </div>
      )}

      {tab === 'decisions' && (
        <div className="card stack">
          <div>
            <h3>The decisions learners make</h3>
            <p className="small muted">Moments arrive as emails, chats, meetings and business updates. Each is scored and changes what happens next. Change how any of them is answered; the content is kept.</p>
          </div>
          {(() => { const m = mixOf(draft.decisions?.points || []); return <MixMeter open={m.open} total={m.total} target={settings.openMix ?? 30} />; })()}
          <div className="stack" style={{ '--gap': '6px' }}>
            {(draft.decisions?.points || []).filter((p) => p.enabled !== false).sort((a, b) => a.week - b.week || a.day - b.day).map((p) => (
              <div key={p.id} className="review-dp">
                <span className="small muted num">W{p.week}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <strong className="small">{renderText(draft, p.title, textVars(draft, null, p))}</strong>
                  <span className="small muted" style={{ display: 'block' }}>{CHANNELS[p.channel]?.label}{p.requires ? ' · only on some paths' : ''}</span>
                </span>
                <select className="select" aria-label={`How "${renderText(draft, p.title, textVars(draft, null, p))}" is answered`} value={p.type} onChange={(e) => setS({ dpTypes: { ...(settings.dpTypes || {}), [p.id]: e.target.value } })}>
                  {Object.entries(INTERACTION_TYPES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="small muted">In the Studio, Decision moments lets you edit options, criteria, consequences and branching.</p>
        </div>
      )}

      {tab === 'fairness' && (
        <div className="card stack">
          <h3>Target</h3>
          {!calibration || calibration.pending ? (
            <p className="small" role="status">Checking… practice players are running through your simulation.</p>
          ) : calibration.own ? (
            <>
              <p>Your target: <strong className="num">{calibration.target}</strong> conversions.</p>
              <p className="small ink2">A leader who reads every person correctly reaches about {pct(calibration.expert)} of it; guessing reaches about {pct(calibration.weak)}. {calibration.suggested !== calibration.target ? `A fair target would be about ${calibration.suggested}.` : ''}</p>
              {calibration.suggested !== calibration.target && <div><Button size="sm" onClick={() => setS({ target: calibration.suggested, targetFrom: 'calibrated' })}>Use {calibration.suggested} instead</Button></div>}
            </>
          ) : (
            <>
              <p>Target: <strong className="num">{calibration.target}</strong> conversions.</p>
              <p className="small ink2">Set so that a learner who reads each person well can reach it, while guessing reaches only about {pct(calibration.weak)} of it.</p>
            </>
          )}
        </div>
      )}

      {blocking.length > 0 && (
        <Callout tone="warn" icon="!">
          Before publishing you will need to fix: {blocking.slice(0, 4).map((i) => i.title.toLowerCase()).join('; ')}{blocking.length > 4 ? '; and more' : ''}. You can create the simulation now and fix {blocking.length === 1 ? 'it' : 'them'} in the Studio.
        </Callout>
      )}
    </div>
  );
}

// A learner-facing text with Edit and one optional action. Replacing the author's own words asks first.
function TextBlock({ draft, title, note, textRef, onSave, action, rows = 6, edited, generic }) {
  const [editing, setEditing] = useState(false);
  const item = collectTexts(draft).find((t) => refKey(t.ref) === refKey(textRef));
  const [value, setValue] = useState(item?.text || '');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!editing) setValue(item?.text || ''); }, [item?.text, editing]);
  const run = () => { if (edited && !confirm) { setConfirm(true); return; } setConfirm(false); action.run(); };
  return (
    <div className="card stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <div>
          <div className="row" style={{ '--gap': '8px' }}><h3>{title}</h3>{edited && <Pill>Your edit</Pill>}{generic && <Pill tone="warn">Written for any industry</Pill>}</div>
          {note && <p className="small muted">{note}</p>}
        </div>
        {!editing && (
          <div className="row">
            <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
            {action && <Button size="sm" variant="ghost" disabled={action.busy} onClick={run}>{action.busy ? 'Writing…' : action.label}</Button>}
          </div>
        )}
      </div>
      {confirm && (
        <Callout tone="warn" icon="!">
          This replaces your own version. <Button size="sm" variant="primary" onClick={run}>Replace it</Button> <Button size="sm" onClick={() => setConfirm(false)}>Keep mine</Button>
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

function EventRow({ draft, ev, onSave, edited }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ev.text);
  return (
    <div className="event-row">
      <span className="small muted num">Week {ev.week}</span>
      <div className="stack" style={{ '--gap': '4px' }}>
        <span className="row" style={{ '--gap': '6px' }}><strong className="small">{ev.name}</strong>{ev.fromBrief && <Pill tone="good">From your description</Pill>}{edited && <Pill>Your edit</Pill>}</span>
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
