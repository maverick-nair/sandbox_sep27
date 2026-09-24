import { useState } from 'react';
import { desiredStyle } from '../../engine/engine.js';
import { styleMix, newId } from '../../engine/authoring.js';
import { Button, Callout, Drawer, Field, NumberInput, SectionHead, SMP, StylePill, TextInput, TokenArea, Seg } from '../ui.jsx';

export default function Team({ def, update, focus }) {
  const [editing, setEditing] = useState(focus?.actorId || null);
  const [showPool, setShowPool] = useState(false);
  const team = def.actors.filter((a) => a.pool === 'team');
  const pool = def.actors.filter((a) => a.pool === 'hire');
  const mix = styleMix(def, desiredStyle);
  const quadrants = Object.values(mix).filter(Boolean).length;
  const actor = def.actors.find((a) => a.id === editing);

  const addPerson = () => {
    const id = newId('person');
    update((d) => {
      d.actors.push({
        id, name: 'New team member', pronoun: 'they', joined: '', experience: '', domain: '', bio: '', pool: 'hire', startStage: d.stages[0].id,
        stats: Object.fromEntries(d.stages.map((s) => [s.id, { s: 50, m: 50, p: 50 }])),
      });
    });
    setEditing(id);
  };

  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <SectionHead eyebrow="Build" title="Team" actions={<Button onClick={addPerson}>Add person</Button>}>
        Each person has skill, morale and performance for every stage. Where they sit on skill and morale decides the leadership style they need, which is what the learner has to read.
      </SectionHead>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
        <div className="card stack">
          <div className="row spread">
            <h3>Diagnosis map</h3>
            <Seg value={showPool ? 'all' : 'team'} onChange={(v) => setShowPool(v === 'all')} options={[{ value: 'team', label: 'Starting team' }, { value: 'all', label: '+ Candidates' }]} label="Who to plot" />
          </div>
          <DiagnosisMap def={def} people={showPool ? [...team, ...pool] : team} onPick={setEditing} />
          <div className="grid cols-2" style={{ '--gap': '6px' }}>
            {def.leadership.styles.map((s) => (
              <div key={s.id} className="row spread small">
                <StylePill def={def} styleId={s.id} />
                <span className="num ink2">{mix[s.id]} {mix[s.id] === 1 ? 'person' : 'people'}</span>
              </div>
            ))}
          </div>
          {quadrants < 3 ? (
            <Callout tone="warn" icon="!">The team clusters in {quadrants} quadrant{quadrants === 1 ? '' : 's'}. Learners can get by with one habit. Spread people across at least three.</Callout>
          ) : (
            <Callout tone="good" icon="✓">The team needs {quadrants} different styles on day one, so learners have to adapt.</Callout>
          )}
        </div>

        <div className="stack">
          <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))` }}>
            {def.stages.map((st) => {
              const people = team.filter((a) => a.startStage === st.id);
              return (
                <div key={st.id} className="stack" style={{ '--gap': '8px' }}>
                  <div className="row spread"><h4>{st.name}</h4><span className="small muted">{people.length}</span></div>
                  {people.length === 0 && <div className="empty small" style={{ padding: 12 }}>No one here. The funnel stops at this stage.</div>}
                  {people.map((a) => <PersonCard key={a.id} def={def} a={a} stage={st.id} onClick={() => setEditing(a.id)} />)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section className="stack">
        <div className="row spread">
          <h2>Hiring pool</h2>
          <span className="small muted">Candidates the learner can hire with Hire member. Their values for the stage they join apply from day one.</span>
        </div>
        <div className="grid cols-4">
          {pool.map((a) => <PersonCard key={a.id} def={def} a={a} stage={a.startStage} onClick={() => setEditing(a.id)} showStage />)}
        </div>
      </section>

      {actor && <ActorEditor def={def} actor={actor} update={update} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonCard({ def, a, stage, onClick, showStage }) {
  const st = a.stats[stage];
  return (
    <button type="button" className="card tight stack" style={{ '--gap': '6px', textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <div className="row spread nowrap">
        <strong style={{ fontSize: 13.5 }}>{a.name}</strong>
      </div>
      {showStage && <span className="small muted">Best fit: {def.stages.find((s) => s.id === a.startStage)?.name}</span>}
      <SMP s={st.s} m={st.m} p={st.p} />
      <StylePill def={def} styleId={desiredStyle(def, st.s, st.m)}>Needs {def.leadership.styles.find((s) => s.id === desiredStyle(def, st.s, st.m))?.name}</StylePill>
    </button>
  );
}

// Skill (x) against morale (y), split at the high threshold into the four style quadrants.
function DiagnosisMap({ def, people, onPick }) {
  const W = 300;
  const pad = 26;
  const inner = W - pad * 2;
  const hi = def.leadership.highThreshold;
  const x = (v) => pad + (v / 100) * inner;
  const y = (v) => pad + inner - (v / 100) * inner;
  const quad = (skill, morale) => def.leadership.styles.find((s) => s.skill === skill && s.morale === morale);
  const zones = [
    { s: quad('low', 'high'), x0: 0, x1: hi, y0: hi, y1: 100 },
    { s: quad('high', 'high'), x0: hi, x1: 100, y0: hi, y1: 100 },
    { s: quad('low', 'low'), x0: 0, x1: hi, y0: 0, y1: hi },
    { s: quad('high', 'low'), x0: hi, x1: 100, y0: 0, y1: hi },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label="Team members plotted by skill and morale" style={{ width: '100%', maxWidth: 360, display: 'block', margin: '0 auto' }}>
      {zones.map((z) => z.s && (
        <g key={z.s.id}>
          <rect x={x(z.x0)} y={y(z.y1)} width={x(z.x1) - x(z.x0)} height={y(z.y0) - y(z.y1)} style={{ fill: z.s.color, opacity: 0.1 }} />
          <text x={x((z.x0 + z.x1) / 2)} y={y(z.y1) + 13} textAnchor="middle" style={{ fill: z.s.color, fontSize: 10.5, fontWeight: 700 }}>{z.s.name.toUpperCase()}</text>
        </g>
      ))}
      <line x1={x(hi)} x2={x(hi)} y1={y(0)} y2={y(100)} style={{ stroke: 'var(--line-strong)' }} strokeDasharray="3 3" />
      <line x1={x(0)} x2={x(100)} y1={y(hi)} y2={y(hi)} style={{ stroke: 'var(--line-strong)' }} strokeDasharray="3 3" />
      <rect x={pad} y={pad} width={inner} height={inner} style={{ fill: 'none', stroke: 'var(--line)' }} />
      <text x={W / 2} y={W - 6} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 10.5 }}>Skill →</text>
      <text x={9} y={W / 2} textAnchor="middle" transform={`rotate(-90 9 ${W / 2})`} style={{ fill: 'var(--muted)', fontSize: 10.5 }}>Morale →</text>
      <text x={x(hi)} y={pad - 6} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 9.5 }}>{hi}</text>
      {people.map((a) => {
        const st = a.stats[a.startStage];
        const s = def.leadership.styles.find((z) => z.id === desiredStyle(def, st.s, st.m));
        const candidate = a.pool !== 'team';
        return (
          <g key={a.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onPick(a.id)} onKeyDown={(e) => e.key === 'Enter' && onPick(a.id)} aria-label={`${a.name}: skill ${st.s}, morale ${st.m}`}>
            <circle cx={x(st.s)} cy={y(st.m)} r={6} style={{ fill: candidate ? 'var(--surface)' : s.color, stroke: s.color, strokeWidth: 2 }} />
            <text x={x(st.s) + 9} y={y(st.m) + 3.5} style={{ fill: 'var(--ink-2)', fontSize: 9.5 }}>{a.name.split(' ')[0]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ActorEditor({ def, actor, update, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const set = (fn) => update((d) => fn(d.actors.find((a) => a.id === actor.id)));
  return (
    <Drawer title={actor.name} subtitle={actor.pool === 'team' ? 'Starting team' : 'Hiring pool'} onClose={onClose} wide>
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="grid cols-2">
          <TextInput label="Name" value={actor.name} onChange={(v) => set((a) => { a.name = v; })} />
          <Field label="Pronouns" id="pronoun">
            <select id="pronoun" className="select" value={actor.pronoun} onChange={(e) => set((a) => { a.pronoun = e.target.value; })}>
              <option value="he">he / him</option>
              <option value="she">she / her</option>
              <option value="they">they / them</option>
            </select>
          </Field>
          <Field label="Where they start" id="pool">
            <select id="pool" className="select" value={actor.pool} onChange={(e) => set((a) => { a.pool = e.target.value; })}>
              <option value="team">Starting team</option>
              <option value="hire">Hiring pool</option>
            </select>
          </Field>
          <Field label={actor.pool === 'team' ? 'Starting stage' : 'Best-fit stage'} id="stage">
            <select id="stage" className="select" value={actor.startStage} onChange={(e) => set((a) => { a.startStage = e.target.value; })}>
              {def.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <TextInput label="Joined" value={actor.joined} onChange={(v) => set((a) => { a.joined = v; })} placeholder="e.g. 2 years ago" />
          <TextInput label="Experience" value={actor.experience} onChange={(v) => set((a) => { a.experience = v; })} />
        </div>
        <TextInput label="Domain skills" value={actor.domain} onChange={(v) => set((a) => { a.domain = v; })} />
        <TokenArea def={def} label="Background" rows={3} value={actor.bio} onChange={(v) => set((a) => { a.bio = v; })} hint="Learners read this when they click the person. Hint at their skill and morale without giving numbers." />
        <div className="stack" style={{ '--gap': '8px' }}>
          <h3>Values by stage</h3>
          <p className="small muted">Skill, morale and performance (0 to 100) if this person works in each stage. Reassigning someone moves them to that stage's values, plus or minus {def.randomness.statBuffer}.</p>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Stage</th><th>Skill</th><th>Morale</th><th>Perf.</th><th>Needs</th></tr></thead>
              <tbody>
                {def.stages.map((st) => {
                  const v = actor.stats[st.id];
                  return (
                    <tr key={st.id} style={{ background: st.id === actor.startStage ? 'var(--accent-soft)' : undefined }}>
                      <td><strong>{st.name}</strong>{st.id === actor.startStage && <span className="small muted"> · start</span>}</td>
                      {['s', 'm', 'p'].map((k) => (
                        <td key={k}><NumberInput className="xs" value={v[k]} min={0} max={100} aria-label={`${st.name} ${k}`} onChange={(n) => set((a) => { a.stats[st.id][k] = n; })} /></td>
                      ))}
                      <td><StylePill def={def} styleId={desiredStyle(def, v.s, v.m)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {confirm ? (
            <div className="row">
              <span className="small">Remove {actor.name} from this simulation?</span>
              <Button size="sm" onClick={() => setConfirm(false)}>Keep</Button>
              <Button size="sm" variant="danger" onClick={() => { update((d) => { d.actors = d.actors.filter((a) => a.id !== actor.id); }); onClose(); }}>Remove</Button>
            </div>
          ) : (
            <Button variant="ghost" className="danger" onClick={() => setConfirm(true)}>Remove person</Button>
          )}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Drawer>
  );
}
