import { useMemo, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';
import { SESSION_LENGTHS, DIFFICULTY, rescaleTimeline, applyDifficulty } from '../engine/authoring.js';
import { contextBoundItems, renderText } from '../engine/text.js';
import { Button, Pill, TextInput, Callout } from './ui.jsx';

const AUDIENCES = ['First-time managers', 'Team leads', 'Mid-level managers', 'Sales managers', 'Graduate hires'];

// Sample name sets so an author can see a full re-skin in one click, then edit.
export const CONTEXT_SAMPLES = {
  Elevators: null,
  Banking: { company: 'Meridian Bank', product: 'FlexiHome Loan', learner_role: 'Regional Sales Head', ceo: 'Anita Rao', competitor: 'Crestline Bank', rival: 'Harbor Trust', product_2: 'Meridian Gold Card', product_3: 'SmartSave Account', board_member: 'Victor Hale', lunch_venue: 'The Copper Pot' },
  'Medical devices': { company: 'Northwind Medical', product: 'CardioSense X2', learner_role: 'Sales Director', ceo: 'Dr. Leah Morgan', competitor: 'Vitalis', rival: 'Beacon Health', product_2: 'PulseTrack', product_3: 'OxyWatch', board_member: 'Martin Crane', lunch_venue: 'Olive and Ash' },
  'IT services': { company: 'Brightpath Technologies', product: 'CloudOps Suite', learner_role: 'Head of Enterprise Sales', ceo: 'Rahul Mehta', competitor: 'Stackline', rival: 'Nimbus Systems', product_2: 'SecureDesk', product_3: 'DataBridge', board_member: 'Grace Liu', lunch_venue: 'Saffron Table' },
};

const STAGE_PRESETS = {
  'B2B sales (legacy)': null,
  'Inside sales': [
    ['Prospecting', 'Team members in this role make first contact with companies and build a list of prospects who may be interested in {{product}}.'],
    ['Discovery', 'Team members in this role run discovery calls to check whether a prospect has a real need and budget.'],
    ['Demo', 'Team members in this role run product demonstrations and send a tailored quote.'],
    ['Negotiation', 'Team members in this role negotiate price and terms with the client.'],
    ['Close', 'Team members in this role close the deal with {{company}} and hand the account over to delivery.'],
  ],
  'Key accounts': [
    ['Account research', 'Team members in this role map target accounts and find entry points for {{product}}.'],
    ['Opportunity', 'Team members in this role qualify opportunities with the account and agree a problem to solve.'],
    ['Solution design', 'Team members in this role design the solution and write the proposal.'],
    ['Commercials', 'Team members in this role negotiate commercials and service levels.'],
    ['Signature', 'Team members in this role secure signatures and set up the order with {{company}}.'],
  ],
};

const STEPS = ['Purpose', 'Context', 'Funnel', 'Review'];

export default function Wizard({ templateId, onCancel, onCreate }) {
  const template = TEMPLATES[templateId];
  const base = useMemo(() => template.create(), [template]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [audience, setAudience] = useState(['First-time managers']);
  const [length, setLength] = useState('long');
  const [difficulty, setDifficulty] = useState('standard');
  const [industry, setIndustry] = useState(base.context.industry);
  const [entities, setEntities] = useState(() => Object.fromEntries(base.context.entities.map((e) => [e.key, e.value])));
  const [moreNames, setMoreNames] = useState(false);
  const [preset, setPreset] = useState('B2B sales (legacy)');
  const [stageNames, setStageNames] = useState(base.stages.map((s) => s.name));

  const build = () => {
    let def = structuredClone(base);
    def.meta.name = name.trim() || `iLead: ${entities.company}`;
    def.meta.audience = audience;
    def.context.industry = industry.trim() || base.context.industry;
    for (const e of def.context.entities) e.value = entities[e.key] ?? e.value;
    const presetStages = STAGE_PRESETS[preset];
    def.stages.forEach((s, i) => {
      s.name = stageNames[i] || s.name;
      if (presetStages) s.description = presetStages[i][1];
    });
    const weeks = SESSION_LENGTHS.find((l) => l.id === length).weeks;
    def = rescaleTimeline(def, weeks);
    def = applyDifficulty(def, difficulty);
    return def;
  };
  const draft = useMemo(build, [name, audience, length, difficulty, industry, entities, preset, stageNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const industryChanged = draft.context.industry.toLowerCase() !== draft.context.originalIndustry.toLowerCase();
  const bound = industryChanged ? contextBoundItems(draft) : [];

  const shown = moreNames ? base.context.entities : base.context.entities.slice(0, 5);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Steps">
        <div className="rail-group">
          <span className="eyebrow">New simulation · {template.name}</span>
          {STEPS.map((s, i) => (
            <button key={s} type="button" className={`rail-item ${i === step ? 'active' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              <span className="badge">{i + 1}</span> {s}
            </button>
          ))}
        </div>
        <div className="rail-group small muted" style={{ padding: '0 10px' }}>
          About two minutes. Everything here can be changed later in the Studio.
        </div>
      </nav>
      <main className="main">
        <div className="page stack" style={{ '--gap': '22px', maxWidth: 920 }}>
          {step === 0 && (
            <>
              <div>
                <div className="eyebrow">Step 1 of 4</div>
                <h1>Who is this for, and how long do they have?</h1>
              </div>
              <TextInput label="Simulation name" placeholder={`iLead: ${entities.company}`} value={name} onChange={setName} hint="Learners see this name. Leave blank to use the company name." />
              <div className="field">
                <span className="label">Audience</span>
                <div className="row">
                  {AUDIENCES.map((a) => (
                    <button key={a} type="button" className={`btn sm ${audience.includes(a) ? 'primary' : ''}`} aria-pressed={audience.includes(a)} onClick={() => setAudience((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">Session length</span>
                <div className="grid cols-3">
                  {SESSION_LENGTHS.map((l) => (
                    <button key={l.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', borderColor: length === l.id ? 'var(--accent)' : undefined, boxShadow: length === l.id ? '0 0 0 3px var(--accent-soft)' : undefined }} onClick={() => setLength(l.id)} aria-pressed={length === l.id}>
                      <h3>{l.label}</h3>
                      <p className="small muted">{l.note}</p>
                    </button>
                  ))}
                </div>
                <span className="hint">Shorter sessions compress the calendar: events, check points and the target move with it.</span>
              </div>
              <div className="field">
                <span className="label">Difficulty</span>
                <div className="grid cols-3">
                  {Object.entries(DIFFICULTY).map(([id, d]) => (
                    <button key={id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', borderColor: difficulty === id ? 'var(--accent)' : undefined, boxShadow: difficulty === id ? '0 0 0 3px var(--accent-soft)' : undefined }} onClick={() => setDifficulty(id)} aria-pressed={difficulty === id}>
                      <h3>{d.label}</h3>
                      <p className="small muted">{d.note}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <div className="eyebrow">Step 2 of 4</div>
                <h1>Put it in your learners' world</h1>
                <p className="ink2" style={{ marginTop: 6, maxWidth: '64ch' }}>Names you set here flow into every letter, event and message. Situations that only make sense in the original industry are listed for rewriting after you create the draft.</p>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
                <div className="stack">
                  <div className="field">
                    <span className="label">Industry</span>
                    <div className="row">
                      {Object.keys(CONTEXT_SAMPLES).map((k) => (
                        <button key={k} type="button" className={`btn sm ${industry === k ? 'primary' : ''}`} onClick={() => {
                          setIndustry(k);
                          const sample = CONTEXT_SAMPLES[k] || Object.fromEntries(base.context.entities.map((e) => [e.key, e.value]));
                          setEntities((x) => ({ ...x, ...sample }));
                        }}>{k}</button>
                      ))}
                    </div>
                    <input className="input" aria-label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                    <span className="hint">Picking a sample industry fills in example names. Type your own to keep the current names.</span>
                  </div>
                  {shown.map((e) => (
                    <TextInput key={e.key} label={e.label} hint={e.hint} value={entities[e.key]} onChange={(v) => setEntities((x) => ({ ...x, [e.key]: v }))} />
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => setMoreNames((m) => !m)}>{moreNames ? 'Show fewer names' : `Show ${base.context.entities.length - 5} more names`}</Button>
                </div>
                <div className="card flat stack" style={{ position: 'sticky', top: 16 }}>
                  <span className="eyebrow">Welcome letter preview</span>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6 }}>{renderText(draft, draft.story.welcome)}</p>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <div className="eyebrow">Step 3 of 4</div>
                <h1>Name the stages of the team's work</h1>
                <p className="ink2" style={{ marginTop: 6, maxWidth: '64ch' }}>The team works as a funnel: each stage passes work to the next, so a weak stage holds everyone back. Keep five stages; rename them to match how your learners' teams talk.</p>
              </div>
              <div className="row">
                {Object.keys(STAGE_PRESETS).map((p) => (
                  <button key={p} type="button" className={`btn sm ${preset === p ? 'primary' : ''}`} onClick={() => {
                    setPreset(p);
                    setStageNames(STAGE_PRESETS[p] ? STAGE_PRESETS[p].map((x) => x[0]) : base.stages.map((s) => s.name));
                  }}>{p}</button>
                ))}
              </div>
              <div className="stack" style={{ '--gap': '8px' }}>
                {stageNames.map((n, i) => {
                  const w = 100 - i * 13;
                  return (
                    <div key={i} className="row nowrap">
                      <span className="badge num">{i + 1}</span>
                      <div style={{ width: `${w}%`, minWidth: 180 }}>
                        <input className="input" aria-label={`Stage ${i + 1} name`} value={n} onChange={(e) => setStageNames((x) => x.map((y, j) => (j === i ? e.target.value : y)))} style={{ background: 'color-mix(in srgb, var(--accent) 7%, var(--surface))' }} />
                      </div>
                      <span className="small muted num">{Math.round(base.stages[i].conversion * 100)}% pass on</span>
                    </div>
                  );
                })}
              </div>
              <Callout tone="accent">The legacy team of 10 people (two per stage) and 10 hiring candidates comes with the template. You can rename, re-profile or replace them in Team.</Callout>
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
                    <tr><td className="muted">Context</td><td>{draft.context.entities[0].value} sells {draft.context.entities[1].value} ({draft.context.industry}). Learner is the {draft.context.entities[2].value}.</td></tr>
                    <tr><td className="muted">Stages</td><td>{draft.stages.map((s) => s.name).join(' → ')}</td></tr>
                    <tr><td className="muted">Target</td><td className="num">{draft.funnel.target} conversions</td></tr>
                  </tbody>
                </table>
              </div>
              {bound.length > 0 ? (
                <Callout tone="warn" icon="!">
                  <strong>{bound.length} items describe the {draft.context.originalIndustry.toLowerCase()} world</strong> (for example "{bound[0].label}"). Names are already updated; the Studio opens on the rewrite list so you can adapt these situations.
                </Callout>
              ) : (
                <Callout tone="good" icon="✓">Every name is set. The Studio opens on the Overview with a health check and a balance check ready to run.</Callout>
              )}
            </>
          )}

          <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <Button variant="ghost" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
            <div className="row">
              {step < 3 && <Button onClick={() => onCreate(draft, bound.length ? 'story' : 'overview')}>Skip to create</Button>}
              {step < 3 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Continue</Button> : <Button variant="primary" size="lg" onClick={() => onCreate(draft, bound.length ? 'story' : 'overview')}>Create draft</Button>}
            </div>
          </div>
          <div className="row small muted"><Pill>Template {template.name} {base.meta.templateVersion}</Pill> <span>Storyline: {base.meta.storyline}</span></div>
        </div>
      </main>
    </div>
  );
}
