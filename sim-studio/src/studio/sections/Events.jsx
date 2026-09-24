import { useState } from 'react';
import { TRIGGER_KINDS } from '../../engine/engine.js';
import { newId } from '../../engine/authoring.js';
import { Button, Drawer, Field, ImpactInputs, NumberInput, Pill, SectionHead, Switch, TextInput, TokenArea, TokenText, impactText, Seg } from '../ui.jsx';

const SEVERITY = {
  Mild: { s: 0, m: -3, p: -2 },
  Moderate: { s: 0, m: -5, p: -5 },
  Severe: { s: 0, m: -9, p: -10 },
};

export default function Events({ def, update, focus }) {
  const [tab, setTab] = useState(focus?.triggerId ? 'triggers' : 'timeline');
  const [editing, setEditing] = useState(focus?.eventId || null);
  const [openTrigger, setOpenTrigger] = useState(focus?.triggerId || null);
  const ev = def.events.find((e) => e.id === editing);

  const addEvent = (week = 1) => {
    const id = newId('event');
    update((d) => { d.events.push({ id, name: 'New event', text: '', week, day: 1, impact: { s: 0, m: -4, p: -3 }, target: 'team', enabled: true }); });
    setEditing(id);
  };
  const addTrigger = () => {
    const id = newId('trigger');
    update((d) => {
      d.triggers.push({ id, name: 'New trigger', text: '{{actor}} ...', impact: { s: 0, m: -3, p: 0 }, enabled: true, rule: { kind: 'perfBelow', threshold: 30 }, maxOccurrences: 1, effect: { unavailableDays: 0, leaves: false }, windows: [{ week: 3, day: 1 }] });
    });
    setOpenTrigger(id);
    setTab('triggers');
  };

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Events" actions={<><Button onClick={() => addEvent()}>Add event</Button><Button onClick={addTrigger}>Add trigger</Button></>}>
        Scheduled events happen to everyone on a set day. Triggers are consequences: they fire when a condition is true about someone, so they reward or punish what the learner did earlier.
      </SectionHead>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'timeline'} className={`tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>Scheduled events ({def.events.filter((e) => e.enabled).length})</button>
        <button type="button" role="tab" aria-selected={tab === 'triggers'} className={`tab ${tab === 'triggers' ? 'active' : ''}`} onClick={() => setTab('triggers')}>Triggers ({def.triggers.filter((t) => t.enabled).length})</button>
      </div>
      {tab === 'timeline' && <Timeline def={def} update={update} onEdit={setEditing} onAdd={addEvent} />}
      {tab === 'triggers' && (
        <div className="stack">
          {def.triggers.map((t) => (
            <TriggerCard key={t.id} def={def} t={t} update={update} open={openTrigger === t.id} onToggle={() => setOpenTrigger(openTrigger === t.id ? null : t.id)} />
          ))}
        </div>
      )}
      {ev && <EventEditor def={def} ev={ev} update={update} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Timeline({ def, update, onEdit, onAdd }) {
  const [drag, setDrag] = useState(null);
  const weeks = Array.from({ length: def.timeline.weeks }, (_, i) => i + 1);
  const unscheduled = def.events.filter((e) => !e.enabled);
  const move = (id, week) => update((d) => {
    const e = d.events.find((x) => x.id === id);
    if (week === 0) e.enabled = false;
    else { e.week = week; e.enabled = true; e.day = Math.min(e.day || 1, d.timeline.daysPerWeek); }
  });
  const checks = (w) => def.triggers.filter((t) => t.enabled).reduce((n, t) => n + t.windows.filter((x) => x.week === w).length, 0);
  const chip = (e) => (
    <button
      key={e.id}
      type="button"
      draggable
      onDragStart={(evt) => { setDrag(e.id); evt.dataTransfer.setData('text/plain', e.id); }}
      onDragEnd={() => setDrag(null)}
      onClick={() => onEdit(e.id)}
      className="card tight"
      style={{ padding: '6px 8px', textAlign: 'left', cursor: 'grab', fontSize: 12.5, borderLeft: `3px solid ${e.impact.m + e.impact.p < -10 ? 'var(--bad)' : 'var(--warn)'}`, width: '100%' }}
      title="Drag to another week, or click to edit"
    >
      <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{e.name}</div>
      <div className="small muted">{e.enabled ? `Day ${e.day} · ` : ''}{e.target === 'actor' ? 'one person' : 'whole team'}</div>
    </button>
  );
  const dropProps = (week) => ({
    onDragOver: (evt) => evt.preventDefault(),
    onDrop: (evt) => { evt.preventDefault(); const id = evt.dataTransfer.getData('text/plain') || drag; if (id) move(id, week); setDrag(null); },
  });
  return (
    <div className="stack">
      <div className="scroll-x">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${def.timeline.weeks}, minmax(128px, 1fr))`, gap: 8, minWidth: def.timeline.weeks * 136 }}>
          {weeks.map((w) => (
            <div key={w} {...dropProps(w)} className="stack" style={{ '--gap': '6px', background: drag ? 'var(--accent-soft)' : 'var(--surface-2)', borderRadius: 10, padding: 8, minHeight: 170 }}>
              <div className="stack" style={{ '--gap': '0' }}>
                <strong className="small">Week {w}</strong>
                <span className="small muted num">{def.funnel.weeklyInflow[w - 1] ?? '-'} leads</span>
              </div>
              {def.events.filter((e) => e.enabled && e.week === w).sort((a, b) => a.day - b.day).map(chip)}
              {checks(w) > 0 && <span className="small muted">{checks(w)} trigger check{checks(w) === 1 ? '' : 's'}</span>}
              <Button size="sm" variant="ghost" onClick={() => onAdd(w)} style={{ marginTop: 'auto' }}>Add</Button>
            </div>
          ))}
        </div>
      </div>
      <div {...dropProps(0)} className="card flat stack" style={{ '--gap': '8px' }}>
        <div className="row spread"><h4>Not scheduled</h4><span className="small muted">Drag an event here to switch it off, or into a week to use it.</span></div>
        <div className="grid cols-4">{unscheduled.length ? unscheduled.map(chip) : <span className="small muted">Every event is scheduled.</span>}</div>
      </div>
    </div>
  );
}

function EventEditor({ def, ev, update, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const set = (fn) => update((d) => fn(d.events.find((e) => e.id === ev.id)));
  return (
    <Drawer title={ev.name} subtitle="Scheduled event" onClose={onClose}>
      <div className="stack" style={{ '--gap': '14px' }}>
        <TextInput label="Name" value={ev.name} onChange={(v) => set((e) => { e.name = v; })} />
        <div className="row">
          <Switch checked={ev.enabled} onChange={(v) => set((e) => { e.enabled = v; if (v && e.week < 1) e.week = 1; })} label="Scheduled" />
          <Field label="Week" id="ew">
            <select id="ew" className="select" value={ev.week} onChange={(e) => set((x) => { x.week = Number(e.target.value); })}>
              {Array.from({ length: def.timeline.weeks }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}
            </select>
          </Field>
          <Field label="Day" id="ed">
            <select id="ed" className="select" value={ev.day} onChange={(e) => set((x) => { x.day = Number(e.target.value); })}>
              {Array.from({ length: def.timeline.daysPerWeek }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Who it affects" id="et">
          <Seg value={ev.target} onChange={(v) => set((e) => { e.target = v; })} options={[{ value: 'team', label: 'Whole team' }, { value: 'actor', label: 'One person, picked at random' }]} label="Who it affects" />
        </Field>
        <TokenArea def={def} label="What the learner reads" rows={4} tokens="actor" value={ev.text} onChange={(v) => set((e) => { e.text = v; })} hint={ev.target === 'actor' ? 'Use the team member field for the person picked.' : ''} />
        <div className="field">
          <span className="label">Impact</span>
          <div className="row">
            {Object.entries(SEVERITY).map(([k, v]) => <Button key={k} size="sm" onClick={() => set((e) => { e.impact = { ...v }; })}>{k}</Button>)}
          </div>
          <ImpactInputs value={ev.impact} onChange={(v) => set((e) => { e.impact = v; })} />
          <span className="hint">{impactText(ev.impact)} for each person affected. Softer when the week's style fits them, harder when it does not.</span>
        </div>
        <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {confirm ? (
            <div className="row"><span className="small">Delete this event?</span><Button size="sm" onClick={() => setConfirm(false)}>Keep</Button><Button size="sm" variant="danger" onClick={() => { update((d) => { d.events = d.events.filter((e) => e.id !== ev.id); }); onClose(); }}>Delete</Button></div>
          ) : <Button variant="ghost" className="danger" onClick={() => setConfirm(true)}>Delete event</Button>}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Drawer>
  );
}

function RuleSentence({ t, set }) {
  const r = t.rule;
  const n = (key, min, max) => <NumberInput className="xs" value={r[key]} min={min} max={max} aria-label={key} onChange={(v) => set((x) => { x.rule[key] = v; })} />;
  switch (r.kind) {
    case 'perfAbove':
      return <span className="row" style={{ '--gap': '6px' }}>When someone's performance is above {n('threshold', 0, 100)}<label className="row small" style={{ '--gap': '4px' }}><input type="checkbox" checked={!!r.needsCover} onChange={(e) => set((x) => { x.rule.needsCover = e.target.checked; })} /> and a colleague covers the same stage</label></span>;
    case 'perfBelow':
      return <span className="row" style={{ '--gap': '6px' }}>When someone's performance is below {n('threshold', 0, 100)}</span>;
    case 'perfDeclining':
      return <span className="row" style={{ '--gap': '6px' }}>When someone's performance has dropped by at least {n('minDrop', 1, 50)} points over {n('weeks', 1, 12)} weeks</span>;
    case 'highPerfNoRecognition':
      return <span className="row" style={{ '--gap': '6px' }}>When someone has performed above {n('threshold', 0, 100)} for {n('weeks', 1, 12)} weeks without praise or a reward</span>;
    case 'sameRole':
      return <span className="row" style={{ '--gap': '6px' }}>When someone has been in the same stage for {n('weeks', 1, 12)} weeks</span>;
    case 'reassignedNotTrained':
      return <span className="row" style={{ '--gap': '6px' }}>When someone was reassigned in the last {n('withinDays', 1, 20)} days and not sent for training</span>;
    default:
      return null;
  }
}

const RULE_DEFAULTS = {
  perfAbove: { threshold: 70, needsCover: false },
  perfBelow: { threshold: 20 },
  perfDeclining: { weeks: 3, minDrop: 5 },
  highPerfNoRecognition: { threshold: 60, weeks: 3 },
  sameRole: { weeks: 4 },
  reassignedNotTrained: { withinDays: 5 },
};

function TriggerCard({ def, t, update, open, onToggle }) {
  const [wk, setWk] = useState(1);
  const [dy, setDy] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const set = (fn) => update((d) => fn(d.triggers.find((x) => x.id === t.id)));
  const effects = [t.effect.leaves && 'they leave the team', t.effect.unavailableDays && `away for ${t.effect.unavailableDays} days`, (t.impact.s || t.impact.m || t.impact.p) && impactText(t.impact)].filter(Boolean);
  return (
    <div className="card stack" style={{ '--gap': '10px', opacity: t.enabled ? 1 : 0.65 }}>
      <div className="row spread nowrap">
        <div className="row nowrap grow">
          <Switch checked={t.enabled} onChange={(v) => set((x) => { x.enabled = v; })} label={<span className="sr-only">Enable {t.name}</span>} />
          <div className="grow">
            <strong>{t.name}</strong>
            <div className="small ink2">{TRIGGER_KINDS[t.rule.kind]?.label} · checked {t.windows.length} time{t.windows.length === 1 ? '' : 's'} · at most {t.maxOccurrences}× · {effects.length ? effects.join(', ') : 'message only'}</div>
          </div>
        </div>
        <Button size="sm" onClick={onToggle}>{open ? 'Close' : 'Edit'}</Button>
      </div>
      {!open && <p className="small muted"><TokenText def={def} text={t.text} /></p>}
      {open && (
        <div className="stack" style={{ '--gap': '14px' }}>
          <TextInput label="Name" value={t.name} onChange={(v) => set((x) => { x.name = v; })} />
          <Field label="Condition" id={`k-${t.id}`}>
            <select id={`k-${t.id}`} className="select" value={t.rule.kind} onChange={(e) => set((x) => { x.rule = { kind: e.target.value, ...RULE_DEFAULTS[e.target.value] }; })}>
              {Object.entries(TRIGGER_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <div className="card flat" style={{ fontSize: 14 }}><RuleSentence t={t} set={set} /></div>
          <div className="field">
            <span className="label">Checked on</span>
            <div className="row" style={{ '--gap': '6px' }}>
              {t.windows.map((w, i) => (
                <span key={`${w.week}-${w.day}`} className={`pill ${w.week > def.timeline.weeks ? 'bad' : ''}`}>
                  Week {w.week} · Day {w.day}
                  <button type="button" className="btn ghost sm" style={{ padding: '0 2px' }} aria-label="Remove check point" onClick={() => set((x) => { x.windows.splice(i, 1); })}>×</button>
                </span>
              ))}
            </div>
            <div className="row nowrap">
              <select className="select" style={{ width: 110 }} value={wk} aria-label="Week" onChange={(e) => setWk(Number(e.target.value))}>{Array.from({ length: def.timeline.weeks }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}</select>
              <select className="select" style={{ width: 100 }} value={dy} aria-label="Day" onChange={(e) => setDy(Number(e.target.value))}>{Array.from({ length: def.timeline.daysPerWeek }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}</select>
              <Button size="sm" onClick={() => set((x) => { if (!x.windows.some((w) => w.week === wk && w.day === dy)) x.windows.push({ week: wk, day: dy }); x.windows.sort((a, b) => a.week - b.week || a.day - b.day); })}>Add check point</Button>
              <Button size="sm" variant="ghost" onClick={() => set((x) => { x.windows = Array.from({ length: def.timeline.weeks }, (_, i) => ({ week: i + 1, day: 1 })); })}>Every Monday</Button>
            </div>
          </div>
          <div className="row">
            <Field label="At most, times per run" id={`mx-${t.id}`}><NumberInput id={`mx-${t.id}`} value={t.maxOccurrences} min={1} max={20} onChange={(v) => set((x) => { x.maxOccurrences = v; })} /></Field>
            <Field label="Away for (days)" id={`ua-${t.id}`}><NumberInput id={`ua-${t.id}`} value={t.effect.unavailableDays} min={0} max={10} onChange={(v) => set((x) => { x.effect.unavailableDays = v; })} /></Field>
            <Switch checked={t.effect.leaves} onChange={(v) => set((x) => { x.effect.leaves = v; })} label="They leave the team" />
          </div>
          <div className="field"><span className="label">Impact on the person</span><ImpactInputs value={t.impact} onChange={(v) => set((x) => { x.impact = v; })} /></div>
          <TokenArea def={def} label="What the learner reads" rows={3} tokens="actor" value={t.text} onChange={(v) => set((x) => { x.text = v; })} />
          {t.legacyNote && <p className="small muted">Legacy rule: {t.legacyNote}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {confirm ? (
              <><span className="small">Delete this trigger?</span><Button size="sm" onClick={() => setConfirm(false)}>Keep</Button><Button size="sm" variant="danger" onClick={() => update((d) => { d.triggers = d.triggers.filter((x) => x.id !== t.id); })}>Delete</Button></>
            ) : <Button size="sm" variant="ghost" className="danger" onClick={() => setConfirm(true)}>Delete trigger</Button>}
          </div>
        </div>
      )}
      {!open && <div className="row" style={{ '--gap': '4px' }}>{t.windows.slice(0, 8).map((w) => <Pill key={`${w.week}-${w.day}`}>W{w.week} D{w.day}</Pill>)}{t.windows.length > 8 && <span className="small muted">+{t.windows.length - 8}</span>}</div>}
    </div>
  );
}
