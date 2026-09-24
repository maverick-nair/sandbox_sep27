import { useMemo, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';
import { SESSION_LENGTHS, DIFFICULTY, rescaleTimeline, applyDifficulty } from '../engine/authoring.js';
import { contextBoundItems, renderText } from '../engine/text.js';
import { Button, Pill, TextInput, Callout } from './ui.jsx';
import { ProfileForm, DepthPicker, ProposalReview, chosen, defaultExcluded, profileSummary } from './Tailoring.jsx';

const AUDIENCES = ['First-time managers', 'Team leads', 'Mid-level managers', 'Sales managers', 'Graduate hires'];
const STEPS = ['Purpose', 'Your organization', 'Tailor', 'Review'];

export default function Wizard({ templateId, onCancel, onCreate }) {
  const template = TEMPLATES[templateId];
  const ctx = template.contextualize;
  const base = useMemo(() => template.create(), [template]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [audience, setAudience] = useState(['First-time managers']);
  const [length, setLength] = useState('long');
  const [difficulty, setDifficulty] = useState('standard');
  const [profile, setProfile] = useState(() => ({ ...base.context.profile }));
  const [excluded, setExcluded] = useState(new Set());
  const [edits, setEdits] = useState({});

  // Layer 2: everything the profile implies, computed against the untouched template.
  const proposals = useMemo(() => ctx.proposeContext(base, profile), [ctx, base, profile]);

  const draft = useMemo(() => {
    let def = structuredClone(base);
    ctx.applyProposals(def, chosen(proposals, excluded, edits), profile);
    def.meta.name = name.trim() || `iLead: ${profile.orgName}`;
    def.meta.audience = audience;
    def = rescaleTimeline(def, SESSION_LENGTHS.find((l) => l.id === length).weeks);
    def = applyDifficulty(def, difficulty);
    return def;
  }, [base, ctx, proposals, excluded, edits, profile, name, audience, length, difficulty]);

  const industryChanged = draft.context.industry.toLowerCase() !== draft.context.originalIndustry.toLowerCase();
  const bound = industryChanged ? contextBoundItems(draft) : [];
  const create = () => onCreate(draft, bound.length ? 'story' : 'overview');
  const changeProfile = (p) => { setProfile(p); setEdits({}); };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Steps">
        <div className="rail-group">
          <span className="eyebrow">New simulation · {template.name}</span>
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={`rail-item ${i === step ? 'active' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="badge" style={{ marginLeft: 0 }}>{i + 1}</span> {s}
            </button>
          ))}
        </div>
        <div className="rail-group small muted" style={{ padding: '0 10px' }}>
          About three minutes. Everything here can be changed later in the Studio.
        </div>
      </nav>
      <main className="main">
        <div className="page stack" style={{ '--gap': '22px', maxWidth: 980 }}>
          {step === 0 && (
            <>
              <div>
                <div className="eyebrow">Step 1 of 4</div>
                <h1>Who is this for, and how long do they have?</h1>
              </div>
              <TextInput label="Simulation name" placeholder={`iLead: ${profile.orgName}`} value={name} onChange={setName} hint="Learners see this name. Leave blank to use your organization's name." />
              <div className="field">
                <span className="label">Audience</span>
                <div className="row">
                  {AUDIENCES.map((a) => (
                    <button key={a} type="button" className={`btn sm ${audience.includes(a) ? 'primary' : ''}`} aria-pressed={audience.includes(a)} onClick={() => setAudience((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>{a}</button>
                  ))}
                </div>
              </div>
              <ChoiceCards label="Session length" value={length} onChange={setLength} options={SESSION_LENGTHS.map((l) => ({ id: l.id, title: l.label, note: l.note }))} hint="Shorter sessions compress the calendar: events, check points and the target move with it." />
              <ChoiceCards label="Difficulty" value={difficulty} onChange={setDifficulty} options={Object.entries(DIFFICULTY).map(([id, d]) => ({ id, title: d.label, note: d.note }))} />
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <div className="eyebrow">Step 2 of 4</div>
                <h1>Tell us about your organization</h1>
                <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Describe the industry, what the team sells, who buys it and where they work. The next step turns this into a tailored simulation: names, money, sales stages, story, events and people.</p>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start', gap: 20 }}>
                <div className="card"><ProfileForm profile={profile} onChange={changeProfile} /></div>
                <div className="card flat stack" style={{ position: 'sticky', top: 16 }}>
                  <span className="eyebrow">Welcome letter, tailored</span>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{renderText(draft, draft.story.welcome)}</p>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <div className="eyebrow">Step 3 of 4</div>
                <h1>Tailor the simulation</h1>
                <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>
                  For <strong>{profileSummary(profile)}</strong>. Choose how deep to go, then review each change and the reason for it. Untick anything you want to keep as it was, or edit the proposal.
                </p>
              </div>
              <DepthPicker value={profile.depth} onChange={(d) => changeProfile({ ...profile, depth: d })} />
              <Callout tone="accent">Only words change. Timing, impacts and pass-on rates stay the same, so the balance of the simulation is not affected.</Callout>
              <ProposalReview def={base} proposals={proposals} excluded={excluded} setExcluded={setExcluded} edits={edits} setEdits={setEdits} />
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <div className="eyebrow">Step 4 of 4</div>
                <h1>Review</h1>
              </div>
              <div className="card">
                <table className="table">
                  <tbody>
                    <tr><td className="muted">Name</td><td>{draft.meta.name}</td></tr>
                    <tr><td className="muted">Audience</td><td>{audience.join(', ') || 'Not set'}</td></tr>
                    <tr><td className="muted">Length</td><td>{SESSION_LENGTHS.find((l) => l.id === length).label}, {draft.timeline.weeks} simulated weeks</td></tr>
                    <tr><td className="muted">Difficulty</td><td>{DIFFICULTY[difficulty].label}</td></tr>
                    <tr><td className="muted">Organization</td><td>{profileSummary(profile)}</td></tr>
                    <tr><td className="muted">Tailoring</td><td>{chosen(proposals, excluded).length} changes at {profile.depth} depth</td></tr>
                    <tr><td className="muted">Stages</td><td>{draft.stages.map((s) => s.name).join(' → ')}</td></tr>
                    <tr><td className="muted">Target</td><td className="num">{draft.funnel.target} conversions, {new Intl.NumberFormat('en', { style: 'currency', currency: draft.funnel.currency, notation: 'compact' }).format(draft.funnel.target * draft.funnel.valuePerConversion)}</td></tr>
                  </tbody>
                </table>
              </div>
              {bound.length > 0 ? (
                <Callout tone="warn" icon="!">
                  <strong>{bound.length} items still describe the original {draft.context.originalIndustry.toLowerCase()} storyline</strong> (for example "{bound[0].label}"). The Studio opens on the rewrite list, where you can edit them or ask Genie.
                </Callout>
              ) : (
                <Callout tone="good" icon="✓">Nothing from the original storyline is left over. The Studio opens on the Overview with a health check and a balance check ready to run.</Callout>
              )}
            </>
          )}

          <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
            <div className="row">
              {step < 3 && <Button onClick={create}>Skip to create</Button>}
              {step === 1 && <Button variant="primary" onClick={() => { setExcluded(defaultExcluded(proposals)); setStep(2); }}>Tailor it</Button>}
              {step !== 1 && step < 3 && <Button variant="primary" onClick={() => setStep(step + 1)}>Continue</Button>}
              {step === 3 && <Button variant="primary" size="lg" onClick={create}>Create draft</Button>}
            </div>
          </div>
          <div className="row small muted"><Pill>Template {template.name} {base.meta.templateVersion}</Pill> <span>Storyline: {base.meta.storyline}</span></div>
        </div>
      </main>
    </div>
  );
}

function ChoiceCards({ label, value, onChange, options, hint }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="grid cols-3">
        {options.map((o) => (
          <button key={o.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', borderColor: value === o.id ? 'var(--accent)' : undefined, boxShadow: value === o.id ? '0 0 0 3px var(--accent-soft)' : undefined }} onClick={() => onChange(o.id)} aria-pressed={value === o.id}>
            <h3>{o.title}</h3>
            <p className="small muted">{o.note}</p>
          </button>
        ))}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
