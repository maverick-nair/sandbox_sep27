// Guided co-creation. The author gives direction (a brief, the outcome, constraints); the flow
// infers the rest and walks through one stage at a time. Every stage is derived from the same
// state, so a change early on flows into everything after it, while the author's own edits stay.
import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';
import { INDUSTRIES } from '../templates/ilead/context-packs.js';
import { COUNTRIES } from '../templates/ilead/world.js';
import { OUTCOMES, CONSTRAINT_CHIPS, AUDIENCES, EXAMPLE_BRIEFS, readBrief, briefPrompt, mergeGenieBrief } from '../templates/ilead/brief.js';
import { suggestProfile, industryPack, locationPack, targetKey, refKey, geniePrompt, genieProposals } from '../templates/ilead/contextualize.js';
import { SESSION_LENGTHS, DIFFICULTY, rescaleTimeline, applyDifficulty } from '../engine/authoring.js';
import { desiredStyle, stageName } from '../engine/engine.js';
import { collectTexts, renderText } from '../engine/text.js';
import { runBalanceAsync, pct } from '../engine/balance.js';
import { Button, Callout, Field, Pill, StylePill, Switch, TextInput, TokenArea, Tip } from './ui.jsx';
import { LocationFields, ProfileForm, useSample } from './Tailoring.jsx';

const STEPS = [
  { id: 'brief', label: 'Your brief', hint: 'What you want, in your words' },
  { id: 'context', label: 'Context', hint: 'Who, what and where' },
  { id: 'story', label: 'Story', hint: 'Letter, product, stages' },
  { id: 'people', label: 'People and events', hint: 'The team and what happens' },
  { id: 'design', label: 'Learning design', hint: 'Length, difficulty, fairness' },
  { id: 'review', label: 'Review', hint: 'Create the draft' },
];

const SOURCE = {
  brief: { label: 'From your brief', tone: 'good' },
  inferred: { label: 'Inferred', tone: 'accent' },
  suggested: { label: 'Suggested', tone: 'accent' },
  default: { label: 'Needs you', tone: 'warn' },
  you: { label: 'Set by you', tone: '' },
};

const LENGTH_OF = Object.fromEntries(SESSION_LENGTHS.map((l) => [l.id, l]));

export default function CreateFlow({ templateId, onCancel, onCreate }) {
  const template = TEMPLATES[templateId];
  const ctx = template.contextualize;
  const base = useMemo(() => template.create(), [template]);
  const sample = useSample();

  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [brief, setBrief] = useState({ instructions: '', outcomes: [], outcomeText: '', constraints: '', chips: [] });
  const [reading, setReading] = useState(null);
  const [sources, setSources] = useState({});
  const [missing, setMissing] = useState([]);
  const [asked, setAsked] = useState([]); // questions shown on the Context step; they stay while being answered
  const [readBy, setReadBy] = useState(null);
  const [profile, setProfile] = useState(() => ({ ...base.context.profile }));
  const [settings, setSettings] = useState({ name: '', audience: ['First-time managers'], length: 'long', difficulty: 'standard', outcomes: ['adapt'], noFiring: false, formal: false, localNames: false, letterVariant: 0, namesVariant: 0, target: null });
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState('');
  const [genieError, setGenieError] = useState('');
  const [calibration, setCalibration] = useState(null);

  const mark = (keys) => setSources((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, 'you'])) }));
  const changeProfile = (next, keys = []) => { setProfile(next); mark(keys); setMissing((m) => m.filter((k) => !keys.includes(k))); };
  const setDriver = (key, value) => changeProfile(suggestProfile({ ...profile, [key]: value }, key, profile), [key]);
  const setS = (patch, keys = Object.keys(patch)) => { setSettings((s) => ({ ...s, ...patch })); mark(keys); };

  // One derived draft for every stage: template → tailoring → the author's edits → settings.
  const draft = useMemo(() => {
    let def = structuredClone(base);
    const p = { ...profile, depth: settings.localNames ? 'deep' : 'standard', letterVariant: settings.letterVariant, namesVariant: settings.namesVariant };
    ctx.applyProposals(def, ctx.proposeContext(def, p), p);
    for (const o of Object.values(overrides)) ctx.writeTarget(def, o.target, o.value);
    def.meta.name = settings.name.trim() || `iLead: ${profile.orgName || 'New simulation'}`;
    def.meta.audience = settings.audience;
    def.meta.outcomes = settings.outcomes;
    def.meta.brief = brief;
    const fire = def.actions.find((a) => a.id === 'fire');
    if (fire) fire.enabled = !settings.noFiring;
    const focus = new Set(settings.outcomes);
    def.report.competencies.sort((a, b) => Number(focus.has(b.id)) - Number(focus.has(a.id)));
    def = rescaleTimeline(def, LENGTH_OF[settings.length].weeks);
    def = applyDifficulty(def, settings.difficulty);
    if (settings.target) def.funnel.target = settings.target;
    return def;
  }, [base, ctx, profile, settings, overrides, brief]);

  const notes = [brief.instructions, brief.outcomeText && `Outcome: ${brief.outcomeText}`, brief.constraints && `Constraints: ${brief.constraints}`, settings.formal && 'Use a formal tone.'].filter(Boolean).join('\n');

  // ---------- reading the brief ----------
  const read = async () => {
    setGenieError('');
    setReading(sample ? 'genie' : 'rules');
    const rules = readBrief(brief, base.context.profile);
    let result = rules;
    if (sample) {
      try {
        const g = await sample.json(briefPrompt(brief), { modelTier: 'default' });
        result = mergeGenieBrief(rules, g, base.context.profile);
      } catch (e) {
        if (e?.code !== 'cancelled') setGenieError('Genie could not read the brief this time, so the built-in rules were used.');
      }
    }
    // Keep anything the author already set by hand in the Context step.
    const mine = Object.entries(sources).filter(([, v]) => v === 'you').map(([k]) => k);
    const nextProfile = { ...result.profile };
    const nextSettings = { ...settings, ...result.settings };
    for (const k of mine) {
      if (k in profile) nextProfile[k] = profile[k];
      if (k in settings) nextSettings[k] = settings[k];
    }
    setProfile(nextProfile);
    setSettings({ ...nextSettings, target: null });
    setSources({ ...result.sources, ...Object.fromEntries(mine.map((k) => [k, 'you'])) });
    setMissing(result.missing.filter((k) => !mine.includes(k)));
    setAsked(result.missing.filter((k) => !mine.includes(k)));
    setReadBy(result.by);
    setCalibration(null);
    setReading(null);
    go(1);
  };

  const go = (i) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    document.querySelector('.main')?.scrollTo({ top: 0 });
  };

  // ---------- Genie regeneration ----------
  const regenerate = async (items, label) => {
    if (!sample || !items.length) return;
    setBusy(label);
    setGenieError('');
    try {
      const reply = await sample.json(geniePrompt(draft, profile, items, notes), { cache: false });
      const props = genieProposals(draft, items, reply).filter((p) => p.status !== 'check');
      setOverrides((o) => ({ ...o, ...Object.fromEntries(props.map((p) => [p.id, { target: p.target, value: p.after }])) }));
    } catch (e) {
      if (e?.code !== 'cancelled') setGenieError(e?.code === 'rate_limited' ? 'Genie is busy. Try again in a minute.' : 'Genie could not finish. Your current version is kept.');
    }
    setBusy('');
  };
  const itemsFor = (pred) => collectTexts(draft).filter((t) => t.text && pred(t));
  const editText = (ref, value) => { const t = { kind: 'ref', ref }; setOverrides((o) => ({ ...o, [targetKey(t)]: { target: t, value } })); };
  const editTarget = (target, value) => setOverrides((o) => ({ ...o, [targetKey(target)]: { target, value } }));
  const dropOverrides = (pred) => setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !pred(v.target))));

  // ---------- fairness: calibrate the target automatically on the design step ----------
  const calKey = JSON.stringify([settings.length, settings.difficulty, settings.noFiring]);
  const calRun = useRef(0);
  useEffect(() => {
    if (STEPS[step].id !== 'design' || calibration?.key === calKey) return;
    const run = ++calRun.current;
    const def = structuredClone(draft);
    if (settings.target) def.funnel.target = draft.funnel.target;
    setCalibration({ key: calKey, pending: true });
    runBalanceAsync(def, { runs: 8, bots: ['expert', 'oneStyle', 'random'] }).then((res) => {
      if (run !== calRun.current) return;
      const target = res.suggestedTarget;
      const scale = def.funnel.target / target;
      setCalibration({ key: calKey, res, target, expert: res.bots.expert.p50 * scale, weak: Math.max(res.bots.random.p50, res.bots.oneStyle.p50) * scale });
      setSettings((s) => ({ ...s, target }));
    });
  }, [step, calKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = STEPS[step].id;
  const canContinue = current !== 'context' || missing.length === 0;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Steps">
        <div className="rail-group">
          <span className="eyebrow">Create with Genie · {template.name}</span>
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
        <div className="rail-group small muted" style={{ padding: '0 10px' }}>
          {sample ? 'Genie reads your brief and drafts each stage. You review, edit or regenerate before moving on.' : 'Built-in rules read your brief here. In the hosted GenieKreator, Genie reads it and can regenerate any stage.'}
        </div>
      </nav>
      <main className="main">
        <div className="page stack" style={{ '--gap': '22px', maxWidth: 940 }}>
          {genieError && <Callout tone="warn" icon="!">{genieError}</Callout>}

          {current === 'brief' && <BriefStep brief={brief} setBrief={setBrief} />}
          {current === 'context' && (
            <ContextStep {...{ profile, settings, sources, missing, asked, readBy, changeProfile, setDriver, setS, onReread: () => { setMissing([]); read(); } }} />
          )}
          {current === 'story' && (
            <StoryStep draft={draft} sample={sample} busy={busy} editText={editText} editTarget={editTarget}
              onRegenerateLetter={() => {
                if (sample) return regenerate(itemsFor((t) => t.ref.field === 'welcome'), 'letter');
                // Without Genie: switch to the next letter version and drop any hand edit of the letter.
                setSettings((s) => ({ ...s, letterVariant: s.letterVariant + 1 }));
                return dropOverrides((t) => t.ref?.field === 'welcome');
              }}
              onRegenerateBrief={() => regenerate(itemsFor((t) => t.ref.field === 'overview' || t.ref.field === 'target'), 'brief')}
              onRegenerateStages={() => regenerate(itemsFor((t) => !!t.ref.stageId), 'stages')}
            />
          )}
          {current === 'people' && (
            <PeopleStep draft={draft} settings={settings} setS={setS} sample={sample} busy={busy} editText={editText} editTarget={editTarget}
              onNewNames={() => { setSettings((s) => ({ ...s, namesVariant: s.namesVariant + 1, localNames: true })); dropOverrides((t) => t.kind === 'actor' && t.field === 'name'); }}
              onRegenerateEvents={() => regenerate(itemsFor((t) => !!t.ref.eventId && draft.events.find((e) => e.id === t.ref.eventId)?.enabled), 'events')}
              onRegenerateBios={() => regenerate(itemsFor((t) => !!t.ref.actorId && draft.actors.find((a) => a.id === t.ref.actorId)?.pool === 'team'), 'bios')}
            />
          )}
          {current === 'design' && <DesignStep draft={draft} settings={settings} setS={setS} sources={sources} calibration={calibration} />}
          {current === 'review' && <ReviewStep draft={draft} profile={profile} settings={settings} sources={sources} overrides={overrides} readBy={readBy} />}

          <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <Button variant="ghost" onClick={step === 0 ? onCancel : () => go(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
            <div className="row">
              {current === 'brief' && (
                <Button variant="primary" size="lg" disabled={!brief.instructions.trim() || !!reading} onClick={read} tip={sample ? 'Genie reads your brief, infers the organization, industry, location and settings, and asks only for what it cannot tell.' : 'Reads your brief with built-in rules and pre-fills every stage. You can change anything on the next steps.'} tipAlign="end">
                  {reading ? (reading === 'genie' ? 'Genie is reading your brief…' : 'Reading your brief…') : 'Build my simulation'}
                </Button>
              )}
              {current !== 'brief' && current !== 'review' && (
                <Button variant="primary" disabled={!canContinue} onClick={() => go(step + 1)} tip={canContinue ? 'Keeps everything on this step and moves on. You can come back at any time.' : 'Answer the questions above first.'} tipAlign="end">
                  {canContinue ? 'Looks good, continue' : `Answer ${missing.length} question${missing.length === 1 ? '' : 's'} to continue`}
                </Button>
              )}
              {current === 'review' && (
                <Button variant="primary" size="lg" disabled={busy === 'create'} tip="Creates the draft and opens it in the Studio, with a fresh balance check attached." tipAlign="end" onClick={async () => {
                  setBusy('create');
                  const balance = await runBalanceAsync(draft, { runs: 10 });
                  onCreate(draft, 'overview', { ...balance, at: Date.now() + 1000, target: draft.funnel.target });
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

// ---------- step 1: the brief ----------

function BriefStep({ brief, setBrief }) {
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  const toggle = (k, id) => setBrief((b) => ({ ...b, [k]: b[k].includes(id) ? b[k].filter((x) => x !== id) : [...b[k], id] }));
  return (
    <>
      <div>
        <div className="eyebrow">Step 1 of 6</div>
        <h1>What do you want to create?</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Describe it the way you would to a colleague. Mention who it is for, your organization, what the team sells and where they work. Genie fills in the rest and asks only for what it cannot tell.</p>
      </div>
      <div className="row small" style={{ '--gap': '6px' }}>
        <span className="muted">Start from an example:</span>
        {EXAMPLE_BRIEFS.map((ex) => <Button key={ex.label} size="sm" onClick={() => setBrief((b) => ({ ...b, instructions: ex.instructions, outcomeText: ex.outcomeText, constraints: ex.constraints }))} tip="Fills in the brief with this example so you can see the flow. Edit it freely.">{ex.label}</Button>)}
      </div>
      <Field label="Your brief" id="b-ins" hint="Two to four sentences is plenty.">
        <textarea id="b-ins" className="textarea" rows={5} value={brief.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. A 60-minute simulation for first-time sales managers at Meridian Bank in Mumbai. Their teams sell home loans to consumers, and new managers struggle to coach low performers." />
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
    </>
  );
}

// ---------- step 2: context ----------

const QUESTIONS = {
  orgName: 'What is your organization called?',
  industry: 'Which industry is it?',
  country: 'Which country is the team in?',
};

function ContextStep({ profile, settings, sources, missing, asked, readBy, changeProfile, setDriver, setS, onReread }) {
  const done = (k) => asked.includes(k) && !missing.includes(k);
  const Q = ({ k }) => <span className="row" style={{ '--gap': '6px' }}>{QUESTIONS[k]}{done(k) && <Pill tone="good">Answered</Pill>}</span>;
  const [editing, setEditing] = useState(false);
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  const rows = [
    ['orgName', 'Organization', profile.orgName || 'Not known yet'],
    ['industry', 'Industry', pack.label],
    ['offeringType', 'Sells', `${profile.offeringType === 'service' ? 'A service' : 'A product'}: ${profile.offeringName || 'name not known yet'}${profile.offeringCategory ? ` (${profile.offeringCategory})` : ''}`],
    ['customerType', 'Buyers', profile.customerType === 'b2c' ? 'Consumers' : 'Businesses'],
    ['country', 'Location', `${profile.city ? `${profile.city}, ` : ''}${loc.label}`],
    ['learnerRole', "Learner's role", profile.learnerRole],
    ['audience', 'Audience', settings.audience.join(', ')],
  ];
  return (
    <>
      <div>
        <div className="eyebrow">Step 2 of 6</div>
        <h1>{asked.length ? 'A few questions' : 'Here is what we understood'}</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>{readBy === 'genie' ? 'Genie read your brief.' : 'Your brief was read with built-in rules.'} Everything below is pre-filled; tell us only what we could not work out.</p>
      </div>

      {asked.length > 0 && (
        <div className="card stack" style={{ borderColor: missing.length ? 'var(--warn)' : 'var(--good)' }}>
          {asked.includes('orgName') && (
            <TextInput label={<Q k="orgName" />} value={profile.orgName} onChange={(v) => changeProfile({ ...profile, orgName: v }, v.trim() ? ['orgName'] : [])} placeholder="e.g. Meridian Bank, or a fictional name" />
          )}
          {asked.includes('industry') && (
            <div className="grid cols-2">
              <Field label={<Q k="industry" />} id="q-ind">
                <select id="q-ind" className="select" value={profile.industry} onChange={(e) => setDriver('industry', e.target.value)}>
                  {Object.entries(INDUSTRIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  <option value="other">Other (describe it)</option>
                </select>
              </Field>
              {profile.industry === 'other' && <TextInput label="Describe your industry" value={profile.customIndustry} onChange={(v) => changeProfile({ ...profile, customIndustry: v }, v.trim() ? ['industry'] : [])} placeholder="e.g. Solar energy" />}
            </div>
          )}
          {asked.includes('country') && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <span className="label small" style={{ fontWeight: 600 }}><Q k="country" /></span>
              <LocationFields profile={profile} onChange={(p) => changeProfile(p, ['country'])} setDriver={(k, v) => changeProfile(suggestProfile({ ...profile, [k]: v }, k, profile), ['country'])} />
            </div>
          )}
          {missing.includes('industry') && profile.industry !== 'other' && <div><Button size="sm" variant="primary" onClick={() => changeProfile(profile, ['industry'])}>Use {INDUSTRIES[profile.industry].label}</Button></div>}
        </div>
      )}

      <div className="card stack" style={{ '--gap': '0' }}>
        {rows.map(([key, label, value]) => {
          const src = SOURCE[sources[key]] || SOURCE.suggested;
          return (
            <div key={key} className="check-row" style={{ gridTemplateColumns: 'minmax(110px, 150px) 1fr auto' }}>
              <span className="small muted">{label}</span>
              <strong className="small">{value}</strong>
              <Pill tone={missing.includes(key) ? 'warn' : src.tone}>{missing.includes(key) ? 'Needs you' : src.label}</Pill>
            </div>
          );
        })}
      </div>
      <div className="row">
        <Button onClick={() => setEditing((e) => !e)} tip="Change any of the details above. Your changes are kept if the brief is read again.">{editing ? 'Hide details' : 'Edit details'}</Button>
        <Button variant="ghost" onClick={onReread} tip="Reads your brief again. Details you changed here are kept.">Read my brief again</Button>
      </div>
      {editing && (
        <div className="card stack">
          <ProfileForm profile={profile} onChange={(p) => changeProfile(p, Object.keys(p).filter((k) => p[k] !== profile[k]))} />
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

// ---------- step 3: story ----------

function EditableText({ draft, title, textRef, onSave, onRegenerate, regenLabel, busy, canRegenerate, rows = 6, tip }) {
  const [editing, setEditing] = useState(false);
  const item = collectTexts(draft).find((t) => refKey(t.ref) === refKey(textRef));
  const [value, setValue] = useState(item?.text || '');
  useEffect(() => { if (!editing) setValue(item?.text || ''); }, [item?.text, editing]);
  return (
    <div className="card stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <h3>{title}</h3>
        <div className="row">
          {!editing && <Button size="sm" onClick={() => setEditing(true)} tip="Change the wording yourself. Names stay linked to your context.">Edit</Button>}
          {onRegenerate && !editing && (
            <Button size="sm" variant="ghost" disabled={!!busy || !canRegenerate} onClick={onRegenerate} tip={canRegenerate ? tip || 'Writes a fresh version from your brief and context.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">
              {busy ? 'Writing…' : regenLabel || 'Regenerate'}
            </Button>
          )}
        </div>
      </div>
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

function StoryStep({ draft, sample, busy, editText, editTarget, onRegenerateLetter, onRegenerateBrief, onRegenerateStages }) {
  return (
    <>
      <div>
        <div className="eyebrow">Step 3 of 6</div>
        <h1>Your story</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Written for your organization and market. Read it as your learners will; edit or regenerate anything.</p>
      </div>
      <EditableText draft={draft} title="Welcome letter" textRef={{ field: 'welcome' }} onSave={(v) => editText({ field: 'welcome' }, v)} onRegenerate={onRegenerateLetter} canRegenerate busy={busy === 'letter'} rows={10} tip={sample ? 'Genie writes a fresh letter from your brief.' : 'Switches to another version of the letter.'} regenLabel={sample ? 'Regenerate' : 'Try another version'} />
      <EditableText draft={draft} title="Product brief" textRef={{ field: 'overview' }} onSave={(v) => editText({ field: 'overview' }, v)} onRegenerate={onRegenerateBrief} canRegenerate={!!sample} busy={busy === 'brief'} />
      <div className="card stack">
        <div className="row spread">
          <h3>How the team's work flows</h3>
          <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateStages} tip={sample ? 'Genie rewrites the stage descriptions for your market. Names stay as they are.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'stages' ? 'Writing…' : 'Regenerate descriptions'}</Button>
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

function PeopleStep({ draft, settings, setS, sample, busy, editText, editTarget, onNewNames, onRegenerateEvents, onRegenerateBios }) {
  const team = draft.actors.filter((a) => a.pool === 'team');
  const events = draft.events.filter((e) => e.enabled).sort((a, b) => a.week - b.week || a.day - b.day);
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
            <Button size="sm" onClick={onNewNames} tip="Picks a different set of local names for the team.">New names</Button>
            <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateBios} tip={sample ? 'Genie rewrites the backgrounds for your industry and location.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'bios' ? 'Writing…' : 'Regenerate backgrounds'}</Button>
          </div>
        </div>
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
          <h3>What happens during the run</h3>
          <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateEvents} tip={sample ? 'Genie rewrites every event for your industry and location. Timing and impact do not change.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'events' ? 'Writing…' : 'Regenerate events'}</Button>
        </div>
        {events.map((e) => <EventRow key={e.id} draft={draft} ev={e} onSave={(v) => editText({ eventId: e.id }, v)} />)}
        <p className="small muted">Plus {draft.triggers.filter((t) => t.enabled).length} consequences that fire from the learner's own decisions, such as a resignation after poor leadership.</p>
      </div>
    </>
  );
}

function EventRow({ draft, ev, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ev.text);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(70px, 90px) 1fr auto', gap: 10, alignItems: 'start', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <span className="small muted num">Week {ev.week}</span>
      <div className="stack" style={{ '--gap': '4px' }}>
        <strong className="small">{ev.name}</strong>
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

function DesignStep({ draft, settings, setS, sources, calibration }) {
  const pill = (k) => { const s = SOURCE[sources[k]] || SOURCE.suggested; return <Pill tone={s.tone}>{s.label}</Pill>; };
  const toggle = (id) => setS({ outcomes: settings.outcomes.includes(id) ? settings.outcomes.filter((x) => x !== id) : [...settings.outcomes, id] });
  return (
    <>
      <div>
        <div className="eyebrow">Step 5 of 6</div>
        <h1>Learning design</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Set from your brief. The target is calibrated for you so a skilled leader can reach it and guessing cannot.</p>
      </div>
      <div className="card stack">
        <div className="row spread"><h3>Focus of the debrief</h3>{pill('outcomes')}</div>
        <div className="row" style={{ '--gap': '6px' }}>
          {OUTCOMES.map((o) => <button key={o.id} type="button" className={`btn sm ${settings.outcomes.includes(o.id) ? 'primary' : ''}`} aria-pressed={settings.outcomes.includes(o.id)} onClick={() => toggle(o.id)}>{o.label}</button>)}
        </div>
        <p className="small muted">The chosen competencies lead the learner's report.</p>
      </div>
      <div className="card stack">
        <div className="row spread"><h3>Session length</h3>{pill('length')}</div>
        <div className="grid cols-3">
          {SESSION_LENGTHS.map((l) => <ChoiceCard key={l.id} on={settings.length === l.id} title={l.label} note={l.note} onClick={() => setS({ length: l.id })} />)}
        </div>
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
          <p className="small">Checking fairness… bots are playing your simulation.</p>
        ) : (
          <Callout tone="good" icon="✓">
            Target set to <strong className="num">{calibration.target}</strong> conversions. A leader who reads the team well reaches about <strong>{pct(calibration.expert)}</strong> of it; guessing or one habit reaches about <strong>{pct(calibration.weak)}</strong>.
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

function ReviewStep({ draft, profile, settings, sources, overrides, readBy }) {
  const inferred = Object.values(sources).filter((v) => v === 'brief' || v === 'inferred' || v === 'suggested').length;
  const yours = Object.values(sources).filter((v) => v === 'you').length + Object.keys(overrides).length;
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: draft.funnel.currency, notation: 'compact' });
  return (
    <>
      <div>
        <div className="eyebrow">Step 6 of 6</div>
        <h1>Ready to create</h1>
      </div>
      <div className="grid cols-3">
        <div className="card"><span className="eyebrow">{readBy === 'genie' ? 'Genie filled in' : 'Filled in for you'}</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{inferred} details</div><span className="small muted">from your brief</span></div>
        <div className="card"><span className="eyebrow">You set or edited</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{yours}</div><span className="small muted">kept exactly as you left them</span></div>
        <div className="card"><span className="eyebrow">Target</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{draft.funnel.target}</div><span className="small muted">{money.format(draft.funnel.target * draft.funnel.valuePerConversion)} revenue</span></div>
      </div>
      <div className="card">
        <table className="table">
          <tbody>
            <tr><td className="muted">Name</td><td>{draft.meta.name}</td></tr>
            <tr><td className="muted">For</td><td>{settings.audience.join(', ')}</td></tr>
            <tr><td className="muted">World</td><td>{profile.orgName}, {industryPack(profile).label.toLowerCase()}, {profile.offeringType === 'service' ? 'a service' : 'a product'} for {profile.customerType === 'b2c' ? 'consumers' : 'businesses'}, {draft.context.entities.find((e) => e.key === 'city')?.value}, {locationPack(profile).label}</td></tr>
            <tr><td className="muted">Session</td><td>{LENGTH_OF[settings.length].label}, {draft.timeline.weeks} simulated weeks, {DIFFICULTY[settings.difficulty].label.toLowerCase()}</td></tr>
            <tr><td className="muted">Stages</td><td>{draft.stages.map((s) => s.name).join(' → ')}</td></tr>
            <tr><td className="muted">Debrief focus</td><td>{settings.outcomes.map((o) => OUTCOMES.find((x) => x.id === o)?.label).join('; ')}</td></tr>
            <tr><td className="muted">Constraints</td><td>{[settings.noFiring && 'No firing', settings.formal && 'Formal tone', settings.localNames && 'Local names'].filter(Boolean).join(', ') || 'None'}</td></tr>
          </tbody>
        </table>
      </div>
      <Callout>After you create the draft, everything stays editable in the Studio, and you can re-tailor from Story and context at any time.</Callout>
    </>
  );
}
