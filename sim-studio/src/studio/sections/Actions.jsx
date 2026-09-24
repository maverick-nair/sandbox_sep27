import { useState } from 'react';
import { MECHANIC_INFO } from '../../engine/engine.js';
import { Button, Callout, Drawer, Field, ImpactInputs, NumberInput, Pill, SectionHead, StylePill, Switch, TextInput, TokenArea, impactText } from '../ui.jsx';

const CATEGORIES = {
  team: 'Whole team',
  'one-to-one': 'One-to-one',
  recognition: 'Recognition',
  development: 'Development',
  structure: 'Team structure',
  insight: 'Insight',
};

// Which outcomes each mechanic uses, in the author's words.
export const OUTCOMES = {
  styleChoice: { 0: 'Style fits', 1: 'One read off', 2: 'Both reads off' },
  weeklyStyleCheck: { 0: "Week's style fits", 1: 'One read off', 2: 'Both reads off' },
  training: { 0: 'Well timed', 1: 'Partly useful', 2: 'Badly timed' },
  performanceTrend: { 0: 'Matches the trend', 1: 'Against the trend', 2: 'Against the trend (legacy copy)' },
  roleChange: { 0: 'Better fit', 1: 'Similar fit', 2: 'Worse fit' },
  reward: { 0: 'Person rewarded', 1: 'Top performer passed over' },
  fire: { 1: 'Everyone else', 2: 'Announcement' },
  hire: { 0: 'Announcement' },
  assess: { 0: 'Result' },
};
const TONE = { 0: 'good', 1: 'warn', 2: 'bad' };

export default function Actions({ def, update, advanced, focus, issues }) {
  const [open, setOpen] = useState(focus?.actionId || null);
  const action = def.actions.find((a) => a.id === open);
  const groups = Object.keys(CATEGORIES).filter((c) => def.actions.some((a) => a.category === c));
  const warnings = (id) => issues.filter((i) => i.ref?.actionId === id && i.severity !== 'info').length;

  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <SectionHead eyebrow="Build" title="Actions">
        What the learner can do during the week. Each action says how it is judged; you write the options and the responses. Numbers stay hidden unless you turn on engine settings.
      </SectionHead>
      {groups.map((g) => (
        <section key={g} className="stack" style={{ '--gap': '8px' }}>
          <h3>{CATEGORIES[g]}</h3>
          <div className="card scroll-x" style={{ padding: 4 }}>
            <table className="table">
              <tbody>
                {def.actions.filter((a) => a.category === g).map((a) => {
                  const days = [...new Set(a.options.map((o) => o.dayCost))].join(' or ');
                  const cd = Math.max(...a.options.map((o) => o.cooldownDays || 0));
                  const w = warnings(a.id);
                  return (
                    <tr key={a.id} className="clickable" onClick={() => setOpen(a.id)}>
                      <td style={{ width: 48 }} onClick={(e) => e.stopPropagation()}>
                        <Switch checked={a.enabled} onChange={(v) => update((d) => { d.actions.find((x) => x.id === a.id).enabled = v; })} label={<span className="sr-only">Enable {a.name}</span>} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, opacity: a.enabled ? 1 : 0.55 }}>{a.name}</div>
                        <div className="small muted">{MECHANIC_INFO[a.mechanic].name} · {a.options.length} option{a.options.length === 1 ? '' : 's'}</div>
                      </td>
                      <td className="small num" style={{ whiteSpace: 'nowrap' }}>{days} day{days === '1' ? '' : 's'}</td>
                      <td className="small">{cd ? `Every ${cd} days` : 'Any time'}</td>
                      <td>{w > 0 && <Pill tone="warn">{w} to review</Pill>}</td>
                      <td style={{ textAlign: 'right' }}><Button size="sm">Edit</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {action && <ActionEditor def={def} action={action} update={update} advanced={advanced} onClose={() => setOpen(null)} initialOption={focus?.optionId} issues={issues} />}
    </div>
  );
}

function ActionEditor({ def, action, update, advanced, onClose, initialOption, issues }) {
  const [optId, setOptId] = useState(initialOption || action.options[0].id);
  const option = action.options.find((o) => o.id === optId) || action.options[0];
  const oi = action.options.indexOf(option);
  const setA = (fn) => update((d) => fn(d.actions.find((a) => a.id === action.id)));
  const setO = (fn) => setA((a) => fn(a.options[oi]));
  const outcomes = OUTCOMES[action.mechanic];
  const styled = action.mechanic === 'styleChoice';
  const own = issues.filter((i) => i.ref?.actionId === action.id && i.severity !== 'info');

  return (
    <Drawer title={action.name} subtitle={`${CATEGORIES[action.category]} · ${MECHANIC_INFO[action.mechanic].name}`} onClose={onClose} wide>
      <div className="stack" style={{ '--gap': '18px' }}>
        <Callout tone="accent"><strong>How it is judged.</strong> {MECHANIC_INFO[action.mechanic].summary}</Callout>
        {own.map((i) => <Callout key={i.id} tone={i.severity === 'error' ? 'bad' : 'warn'} icon="!"><strong>{i.title}.</strong> {i.detail}</Callout>)}
        <div className="grid cols-2">
          <TextInput label="Action name" value={action.name} onChange={(v) => setA((a) => { a.name = v; })} />
          {action.scope !== 'team' && <TextInput label="Prompt when picking people" value={action.selectPrompt} onChange={(v) => setA((a) => { a.selectPrompt = v; })} />}
        </div>
        <TokenArea def={def} label="Description" rows={3} value={action.description} onChange={(v) => setA((a) => { a.description = v; })} />
        {advanced && (
          <div className="row">
            <span className="advanced-tag">Engine</span>
            {action.scope !== 'team' && action.mechanic !== 'roleChange' && (
              <Field label="People per use" id="maxT"><NumberInput id="maxT" value={action.maxTargets || 1} min={1} max={10} onChange={(v) => setA((a) => { a.maxTargets = v; })} /></Field>
            )}
            {action.mechanic === 'performanceTrend' && (
              <Field label="Compare with performance this many days ago" id="lb"><NumberInput id="lb" value={action.lookbackDays} min={1} max={30} onChange={(v) => setA((a) => { a.lookbackDays = v; })} /></Field>
            )}
          </div>
        )}

        <div className="stack" style={{ '--gap': '10px' }}>
          <h3>Options</h3>
          {action.options.length > 1 && (
            <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
              {action.options.map((o) => (
                <button key={o.id} type="button" role="tab" aria-selected={o.id === option.id} className={`tab ${o.id === option.id ? 'active' : ''}`} onClick={() => setOptId(o.id)}>
                  {styled ? <StylePill def={def} styleId={o.style} /> : o.label}
                </button>
              ))}
            </div>
          )}
          <div className="card flat stack">
            {styled ? (
              <>
                <Field label="Option text the learner reads" id="otext">
                  <textarea id="otext" className="textarea" rows={2} value={option.text} onChange={(e) => setO((o) => { o.text = e.target.value; })} />
                </Field>
                <Field label="Leadership style this option expresses" id="ostyle" hint="The learner is judged on whether this style fits the person.">
                  <select id="ostyle" className="select" value={option.style} onChange={(e) => setO((o) => { o.style = e.target.value; })}>
                    {def.leadership.styles.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.skill} skill, {s.morale} morale)</option>)}
                  </select>
                </Field>
              </>
            ) : action.options.length > 1 ? (
              <TextInput label="Option name" value={option.label} onChange={(v) => setO((o) => { o.label = v; })} />
            ) : null}
            <div className="row">
              <Field label="Days it takes" id="dc"><NumberInput id="dc" value={option.dayCost} min={1} max={def.timeline.daysPerWeek} onChange={(v) => setO((o) => { o.dayCost = v; })} /></Field>
              <Field label="Wait before reuse (days)" id="cd" hint="0 means any time."><NumberInput id="cd" value={option.cooldownDays} min={0} max={100} onChange={(v) => setO((o) => { o.cooldownDays = v; })} /></Field>
              {action.mechanic === 'training' && (
                <Field label="Days away training" id="ua"><NumberInput id="ua" value={option.unavailableDays} min={1} max={10} onChange={(v) => setO((o) => { o.unavailableDays = v; })} /></Field>
              )}
            </div>
          </div>
        </div>

        <div className="stack" style={{ '--gap': '10px' }}>
          <div className="row spread">
            <h3>Responses{action.options.length > 1 ? ` for ${styled ? def.leadership.styles.find((s) => s.id === option.style)?.name : option.label}` : ''}</h3>
            {styled && action.options.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => setA((a) => { a.options.forEach((o) => { if (o !== a.options[oi]) o.outcomes = structuredClone(a.options[oi].outcomes); }); })}>Copy to all options</Button>
            )}
          </div>
          <p className="small muted">{action.scope === 'team' ? 'Team actions show one message, based on how most of the team reacted.' : 'Several versions of a response keep repeat plays fresh; one is picked at random.'}</p>
          {Object.entries(outcomes).map(([k, label]) => {
            const oc = option.outcomes[k];
            return (
              <div key={k} className="card stack" style={{ '--gap': '8px', borderLeft: `3px solid var(--${TONE[k]})` }}>
                <div className="row spread">
                  <div className="row"><Pill tone={TONE[k]}>{label}</Pill>{!advanced && <span className="small muted">{impactText(oc.impact)}</span>}</div>
                  {advanced && <ImpactInputs value={oc.impact} onChange={(v) => setO((o) => { o.outcomes[k].impact = v; })} />}
                </div>
                {oc.messages.length === 0 && <p className="small muted">No response written. The learner sees the nearest outcome's response.</p>}
                {oc.messages.map((m, i) => (
                  <div key={i} className="row nowrap" style={{ alignItems: 'flex-start' }}>
                    <div className="grow"><TokenArea def={def} rows={2} tokens="actor" value={m} onChange={(v) => setO((o) => { o.outcomes[k].messages[i] = v; })} /></div>
                    <Button size="sm" variant="ghost" className="danger" onClick={() => setO((o) => { o.outcomes[k].messages.splice(i, 1); })} aria-label="Remove response">Remove</Button>
                  </div>
                ))}
                <div><Button size="sm" onClick={() => setO((o) => { o.outcomes[k].messages.push(''); })}>Add a version</Button></div>
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
