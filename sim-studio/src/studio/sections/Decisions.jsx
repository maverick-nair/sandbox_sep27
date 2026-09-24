// Decision moments: the situations a learner meets inside the quarter. The author sets each
// moment's channel, timing, interaction type, options or evaluation criteria, consequences and
// branching, and keeps the structured to open mix near the target they chose.
import { useState } from 'react';
import { INTERACTION_TYPES, CHANNELS, BANDS, mixOf, slotsOf, describeCondition, kpiLabel, flagLabel, textVars, DEFAULT_SCORING, TIERS, bandOf } from '../../engine/decisions.js';
import { evaluateOpen, openEvalPrompt, parseGenieEval, suggestCriteria, draftKeyIdeas, CRITERIA_LIBRARY, DEFAULT_CRITERIA } from '../../engine/nlp.js';
import { renderText } from '../../engine/text.js';
import { newId } from '../../engine/authoring.js';
import { TEMPLATES } from '../../templates/registry.js';
import { Button, Callout, Drawer, Field, ImpactInputs, NumberInput, Pill, SectionHead, Seg, Switch, TextInput, TokenArea, impactText } from '../ui.jsx';
import { useSample } from '../Tailoring.jsx';

const TYPE_SHORT = { single: 'Single choice', multi: 'Multi-select', rank: 'Ranking', scenario: 'Scenario', open: 'Open response' };
const BAND_LABEL = { strong: 'Strong answer', mixed: 'Mixed answer', weak: 'Weak answer' };
const EMPTY_IMPACT = { s: 0, m: 0, p: 0 };

const tplOf = (def) => TEMPLATES[def.meta.templateId]?.decisions || {};

export default function Decisions({ def, update, focus, notify, onPlay }) {
  const [editing, setEditing] = useState(focus?.dpId || null);
  const [tab, setTab] = useState(focus?.tab || 'moments');
  const points = def.decisions?.points || [];
  const dp = points.find((p) => p.id === editing);

  const addMoment = (type) => {
    const id = newId('moment');
    const week = Math.min(def.timeline.weeks, Math.max(1, ...points.map((p) => p.week)) + 0);
    const base = {
      id, title: 'New moment', week, day: 2, channel: 'email', from: { entity: 'ceo' }, type: 'scenario', level: 2,
      situation: '', prompt: 'What do you do?',
      options: [
        { id: 'a', text: 'The strongest course of action', quality: 85, reaction: '', feedback: '' },
        { id: 'b', text: 'A reasonable but partial response', quality: 50, reaction: '', feedback: '' },
        { id: 'c', text: 'A response that makes things worse', quality: 15, reaction: '', feedback: '' },
      ],
    };
    const conv = tplOf(def).convertType;
    const made = type !== 'scenario' && conv ? conv(base, type, def) : base;
    update((d) => { d.decisions.points.push(made); });
    setEditing(id);
  };

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Decision moments" actions={<AddMenu onAdd={addMoment} />}>
        The situations your learner meets inside the quarter: an email from the CEO, a chat, a meeting, a business update. Each moment has an interaction type, is scored, and changes what happens next.
      </SectionHead>
      <div className="tabs" role="tablist">
        {[['moments', `Moments (${slotsOf(points).length})`], ['scoring', 'Scoring and KPIs'], ['learning', 'Learning design']].map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'moments' && (
        <>
          <MixCard def={def} update={update} notify={notify} />
          <MomentList def={def} update={update} onEdit={setEditing} />
        </>
      )}
      {tab === 'scoring' && <ScoringTab def={def} update={update} />}
      {tab === 'learning' && <LearningTab def={def} update={update} />}
      {dp && <MomentEditor key={dp.id} def={def} dp={dp} update={update} notify={notify} onClose={() => setEditing(null)} onPlay={onPlay} />}
    </div>
  );
}

function AddMenu({ onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <Button variant="primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Add moment</Button>
      {open && (
        <div className="card tight menu-pop" role="menu">
          {Object.entries(INTERACTION_TYPES).map(([id, t]) => (
            <button key={id} type="button" role="menuitem" className="rail-item" onClick={() => { setOpen(false); onAdd(id); }}>
              <span className="stack" style={{ '--gap': '0px', textAlign: 'left' }}><strong>{t.label}</strong><span className="small muted">{t.note}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- mix ----------

export function MixMeter({ open, total, target }) {
  const pct = total ? Math.round((open / total) * 100) : 0;
  return (
    <div className="mix-meter" aria-label={`${total - open} structured, ${open} open, target ${target}% open`}>
      <div className="mix-track">
        <span className="mix-structured" style={{ width: `${100 - pct}%` }} />
        <span className="mix-open" style={{ width: `${pct}%` }} />
        <span className="mix-target" style={{ left: `${100 - target}%` }} title={`Target: ${target}% open`} />
      </div>
      <div className="row spread small">
        <span><span className="mix-key structured" aria-hidden="true" /> Structured {total - open} ({100 - pct}%)</span>
        <span><span className="mix-key open" aria-hidden="true" /> Open response {open} ({pct}%)</span>
      </div>
    </div>
  );
}

function MixCard({ def, update, notify }) {
  const points = def.decisions?.points || [];
  const m = mixOf(points);
  const target = def.decisions?.mix?.open ?? 30;
  const want = Math.round((m.total * target) / 100);
  const off = m.open - want;
  const locked = slotsOf(points).filter((p) => p.lockType).length;
  const rebalance = () => {
    const apply = tplOf(def).applyMix;
    if (!apply) return;
    update((d) => { d.decisions.points = apply(d.decisions.points, d.decisions.mix?.open ?? 30, d); });
    notify('Rebalanced. Undo is at the top.');
  };
  return (
    <div className="card stack" style={{ '--gap': '12px' }}>
      <div className="row spread">
        <div>
          <h3>Interaction mix</h3>
          <p className="small muted">How many moments are structured choices and how many ask for an answer in the learner's own words. Branches that replace each other count once.</p>
        </div>
        {off !== 0 && <Button onClick={rebalance} tip={`Changes ${Math.abs(off)} moment${Math.abs(off) === 1 ? '' : 's'} to ${off > 0 ? 'a structured type' : 'open response'}, keeping the content. Moments you locked are not changed.`} tipAlign="end">Rebalance to {target}%</Button>}
      </div>
      <MixMeter open={m.open} total={m.total} target={target} />
      <div className="row" style={{ '--gap': '14px' }}>
        <label className="row nowrap small" style={{ '--gap': '8px' }}>
          <span>Target open share</span>
          <input type="range" min={0} max={100} step={5} value={target} onChange={(e) => update((d) => { d.decisions.mix = { ...(d.decisions.mix || {}), open: Number(e.target.value) }; })} aria-label="Target share of open responses" />
          <strong className="num">{target}%</strong>
        </label>
        <span className="small muted">{target === 30 ? 'The recommended 70:30.' : `${100 - target}:${target}. The recommended mix is 70:30.`}{locked ? ` ${locked} locked.` : ''}</span>
      </div>
      {off !== 0 && <p className="small" style={{ color: 'var(--warn)' }}>{off > 0 ? `${off} more open` : `${-off} fewer open`} moment{Math.abs(off) === 1 ? '' : 's'} than the target.</p>}
    </div>
  );
}

// ---------- list ----------

function MomentList({ def, update, onEdit }) {
  const points = def.decisions?.points || [];
  const weeks = Array.from({ length: def.timeline.weeks }, (_, i) => i + 1);
  const outside = points.filter((p) => p.week < 1 || p.week > def.timeline.weeks);
  const row = (p) => {
    const alt = p.slot && points.filter((x) => (x.slot || x.id) === p.slot && x.id !== p.id);
    return (
      <div key={p.id} className={`moment-row ${p.enabled === false ? 'off' : ''}`}>
        <button type="button" className="moment-main" onClick={() => onEdit(p.id)}>
          <span className="moment-when small muted">Day {p.day}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="moment-title">{renderText(def, p.title, textVars(def, null, p))}</span>
            <span className="small muted moment-meta">
              {CHANNELS[p.channel]?.label || p.channel} · from {fromLabel(def, p)}
              {p.requires ? ` · ${describeCondition(def, p.requires)}` : ''}
              {alt?.length ? ` · instead of ${alt.map((x) => `"${renderText(def, x.title, textVars(def, null, x))}"`).join(', ')}` : ''}
            </span>
          </span>
          <Pill tone={p.type === 'open' ? 'accent' : ''}>{TYPE_SHORT[p.type]}</Pill>
          {p.lockType && <span className="small muted" title="Kept as this type when rebalancing">locked</span>}
        </button>
        <Switch checked={p.enabled !== false} onChange={(v) => update((d) => { d.decisions.points.find((x) => x.id === p.id).enabled = v; })} label={<span className="sr-only">Include {p.title}</span>} />
      </div>
    );
  };
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      {weeks.map((w) => {
        const list = points.filter((p) => p.week === w).sort((a, b) => a.day - b.day);
        const refl = (def.learning?.reflections || []).filter((r) => r.week === w);
        if (!list.length && !refl.length) return null;
        return (
          <div key={w} className="moment-week">
            <div className="eyebrow">Week {w}</div>
            {list.map(row)}
            {def.learning?.reflection !== false && refl.map((r) => <div key={r.id} className="moment-row reflect small muted">End of week reflection: {r.prompt}</div>)}
          </div>
        );
      })}
      {outside.length > 0 && (
        <div className="moment-week"><div className="eyebrow" style={{ color: 'var(--bad)' }}>Outside the calendar</div>{outside.map(row)}</div>
      )}
      {!points.length && <Callout icon="i">No moments yet. Add one: it can be an email from the CEO, a chat with someone on the team, a meeting or a business update.</Callout>}
    </div>
  );
}

function fromLabel(def, p) {
  const f = p.from || {};
  if (f.actor) return def.actors.find((a) => a.id === f.actor)?.name || 'a team member';
  if (f.entity) return renderText(def, `{{${f.entity}}}`);
  return renderText(def, f.name || 'Business update');
}

// ---------- editor ----------

function MomentEditor({ def, dp, update, notify, onClose, onPlay }) {
  const [tab, setTab] = useState('situation');
  const up = (fn) => update((d) => { const p = d.decisions.points.find((x) => x.id === dp.id); if (p) fn(p, d); });
  const points = def.decisions.points;
  const convert = tplOf(def).convertType;
  const vars = textVars(def, null, dp);
  const title = renderText(def, dp.title, vars);
  const [confirmDel, setConfirmDel] = useState(false);

  const setType = (type) => {
    if (!convert || type === dp.type) return;
    update((d) => { const i = d.decisions.points.findIndex((x) => x.id === dp.id); d.decisions.points[i] = convert(d.decisions.points[i], type, d); });
    notify(`Now ${INTERACTION_TYPES[type].label.toLowerCase()}. The content was kept; review it below.`);
  };
  const duplicate = () => {
    const id = newId('moment');
    update((d) => { const src = d.decisions.points.find((x) => x.id === dp.id); d.decisions.points.push({ ...JSON.parse(JSON.stringify(src)), id, title: `${src.title} (copy)`, slot: undefined }); });
    notify('Duplicated.');
  };
  const remove = () => {
    update((d) => {
      d.decisions.points = d.decisions.points.filter((x) => x.id !== dp.id);
      for (const p of d.decisions.points) if (p.requires?.decision === dp.id) delete p.requires;
    });
    onClose();
    notify('Moment deleted. Undo is at the top.');
  };

  const tabs = [['situation', 'Situation'], ['response', dp.type === 'open' ? 'Evaluation' : 'Options'], ['outcomes', 'Outcomes'], ['branching', 'Branching'], ['recall', 'Recall']];

  return (
    <Drawer title={title || 'Untitled moment'} subtitle={`${INTERACTION_TYPES[dp.type]?.label} · ${CHANNELS[dp.channel]?.label} · week ${dp.week}, day ${dp.day}`} onClose={onClose} wide
      actions={<><Button size="sm" variant="ghost" onClick={duplicate}>Duplicate</Button>{confirmDel ? <><Button size="sm" onClick={() => setConfirmDel(false)}>Keep</Button><Button size="sm" variant="danger" onClick={remove}>Delete</Button></> : <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)}>Delete</Button>}</>}>
      <div className="stack" style={{ '--gap': '16px' }}>
        <div className="card tight stack" style={{ '--gap': '8px' }}>
          <span className="eyebrow">Interaction type</span>
          <Seg label="Interaction type" value={dp.type} onChange={setType} options={Object.entries(INTERACTION_TYPES).map(([id, t]) => ({ value: id, label: t.label }))} />
          <p className="small muted">{INTERACTION_TYPES[dp.type]?.note} Switching keeps the situation, and turns options into criteria and key ideas (or back).</p>
          <Switch checked={!!dp.lockType} onChange={(v) => up((p) => { p.lockType = v || undefined; })} label="Keep this type when rebalancing the mix" />
        </div>

        <div className="tabs" role="tablist">
          {tabs.map(([id, l]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{l}</button>)}
        </div>

        {tab === 'situation' && <SituationTab def={def} dp={dp} up={up} />}
        {tab === 'response' && (dp.type === 'open' ? <OpenTab def={def} dp={dp} up={up} notify={notify} /> : <OptionsTab def={def} dp={dp} up={up} />)}
        {tab === 'outcomes' && <OutcomesTab def={def} dp={dp} up={up} />}
        {tab === 'branching' && <BranchingTab def={def} dp={dp} up={up} points={points} update={update} />}
        {tab === 'recall' && <RecallTab def={def} dp={dp} up={up} />}

        {onPlay && <p className="small muted">To try this moment in context, use Play as learner and turn on x-ray.</p>}
      </div>
    </Drawer>
  );
}

function SituationTab({ def, dp, up }) {
  const f = dp.from || {};
  const fromKind = f.actor ? 'actor' : f.entity ? 'entity' : 'other';
  const people = def.actors.filter((a) => a.status !== 'pool');
  const entities = def.context.entities.filter((e) => ['ceo', 'manager', 'hr', 'client', 'customer'].some((k) => e.key.toLowerCase().includes(k)) || e.key === 'ceo');
  const concepts = def.decisions.concepts || {};
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <TextInput label="Title the learner sees" value={dp.title} onChange={(v) => up((p) => { p.title = v; })} hint="You can use {{actor}} for the person the moment is about." />
      <div className="grid cols-2">
        <Field label="Arrives as">
          <select className="select" value={dp.channel} onChange={(e) => up((p) => { p.channel = e.target.value; })}>
            {Object.entries(CHANNELS).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="From">
          <div className="row nowrap" style={{ '--gap': '6px' }}>
            <select className="select" value={fromKind} onChange={(e) => up((p) => { p.from = e.target.value === 'actor' ? { actor: p.about || people[0]?.id } : e.target.value === 'entity' ? { entity: 'ceo' } : { name: 'Sales dashboard', role: '' }; })} aria-label="Sender kind">
              <option value="entity">Leadership</option>
              <option value="actor">Someone on the team</option>
              <option value="other">A system or group</option>
            </select>
            {fromKind === 'actor' && <select className="select" value={f.actor} onChange={(e) => up((p) => { p.from = { actor: e.target.value }; })} aria-label="Team member">{people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
            {fromKind === 'entity' && <select className="select" value={f.entity} onChange={(e) => up((p) => { p.from = { ...p.from, entity: e.target.value }; })} aria-label="Leader">{(entities.length ? entities : def.context.entities).map((e) => <option key={e.key} value={e.key}>{e.value || e.label} ({e.label})</option>)}</select>}
          </div>
        </Field>
      </div>
      {fromKind === 'other' && (
        <div className="grid cols-2">
          <TextInput label="Sender name" value={f.name} onChange={(v) => up((p) => { p.from = { ...p.from, name: v }; })} />
          <TextInput label="Sender detail" value={f.role} onChange={(v) => up((p) => { p.from = { ...p.from, role: v }; })} placeholder="e.g. Weekly numbers" />
        </div>
      )}
      <div className="grid cols-2">
        <Field label="About" hint="The person the moment is about. Their name fills {{actor}}, and their skill and morale decide which style fits.">
          <select className="select" value={dp.about || ''} onChange={(e) => up((p) => { p.about = e.target.value || undefined; })}>
            <option value="">Nobody in particular</option>
            {people.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Also involves" hint="Fills {{actor2}}.">
          <select className="select" value={dp.about2 || ''} onChange={(e) => up((p) => { p.about2 = e.target.value || undefined; })}>
            <option value="">Nobody else</option>
            {people.filter((a) => a.id !== dp.about).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid cols-3">
        <Field label="Week"><NumberInput value={dp.week} min={1} max={def.timeline.weeks} onChange={(v) => up((p) => { p.week = v; })} aria-label="Week" /></Field>
        <Field label="Day"><NumberInput value={dp.day} min={1} max={def.timeline.daysPerWeek} onChange={(v) => up((p) => { p.day = v; })} aria-label="Day" /></Field>
        <Field label="Difficulty">
          <Seg label="Difficulty" value={dp.level || 1} onChange={(v) => up((p) => { p.level = v; })} options={[{ value: 1, label: 'Intro' }, { value: 2, label: 'Core' }, { value: 3, label: 'Stretch' }]} />
        </Field>
      </div>
      <Field label="Key concept" hint="What this moment practises. The debrief and spaced recall use it.">
        <select className="select" value={dp.concept || ''} onChange={(e) => up((p) => { p.concept = e.target.value || undefined; })}>
          <option value="">None</option>
          {Object.entries(concepts).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
        </select>
      </Field>
      <TokenArea def={def} label="Situation" tokens="decision" rows={4} value={dp.situation} onChange={(v) => up((p) => { p.situation = v; })} hint="What the learner reads. Write it as the sender would." />
      <TokenArea def={def} label="Question to the learner" tokens="decision" rows={2} value={dp.prompt} onChange={(v) => up((p) => { p.prompt = v; })} />
      <div className="card tight stack" style={{ '--gap': '8px' }}>
        <Switch checked={dp.deadline !== 'none'} onChange={(v) => up((p) => { p.deadline = v ? undefined : 'none'; })} label="The moment passes if the learner does not answer by the end of the week" />
        {dp.deadline !== 'none' && (
          <>
            <TokenArea def={def} label="What happens if nobody answers" tokens="decision" rows={2} value={dp.noResponse?.reaction ?? 'No reply came back from you, and the moment passed.'} onChange={(v) => up((p) => { p.noResponse = { ...(p.noResponse || { consequences: { kpis: { trust: -2 } } }), reaction: v }; })} preview={false} />
            <Cons def={def} dp={dp} value={dp.noResponse?.consequences || { kpis: { trust: -2 } }} onChange={(c) => up((p) => { p.noResponse = { reaction: p.noResponse?.reaction ?? 'No reply came back from you, and the moment passed.', ...(p.noResponse || {}), consequences: c }; })} />
          </>
        )}
      </div>
    </div>
  );
}

function OptionsTab({ def, dp, up }) {
  const styles = def.leadership.styles;
  const styleBased = (dp.options || []).some((o) => o.style);
  const opts = dp.options || [];
  const setOpt = (i, fn) => up((p) => fn(p.options[i]));
  const move = (i, d) => up((p) => { const j = i + d; if (j < 0 || j >= p.options.length) return; [p.options[i], p.options[j]] = [p.options[j], p.options[i]]; p.options.forEach((o, k) => { if (p.type === 'rank') o.rank = k; }); });
  const add = () => up((p) => { const id = newId('opt'); p.options = [...(p.options || []), { id, text: 'New option', ...(p.type === 'multi' ? { correct: false } : p.type === 'rank' ? { rank: p.options?.length || 0 } : { quality: 50 }) }]; });
  const del = (i) => up((p) => { p.options.splice(i, 1); if (p.type === 'rank') p.options.forEach((o, k) => { o.rank = k; }); });
  const order = dp.type === 'rank' ? [...opts].map((o, i) => ({ o, i })).sort((a, b) => (a.o.rank ?? a.i) - (b.o.rank ?? b.i)) : opts.map((o, i) => ({ o, i }));
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      {dp.type === 'multi' && (
        <div className="row"><span className="small">Learners can pick up to</span><NumberInput className="xs" value={dp.maxSelect || opts.length} min={1} max={opts.length || 1} onChange={(v) => up((p) => { p.maxSelect = v; })} aria-label="Maximum picks" /><span className="small muted">Scored on how many right options they pick and how few wrong ones.</span></div>
      )}
      {dp.type === 'rank' && <p className="small muted">List the options in the right order. Learners see them shuffled and are scored on how close their order is.</p>}
      {styleBased && <p className="small muted">These options are leadership styles: the best one depends on {dp.about ? def.actors.find((a) => a.id === dp.about)?.name : 'the person'}'s skill and morale at that moment in the run, so it can change from learner to learner.</p>}
      {order.map(({ o, i }, k) => (
        <div key={o.id} className="card tight stack option-card" style={{ '--gap': '8px' }}>
          <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
            {dp.type === 'rank' && <span className="lx-rank-num" aria-label={`Position ${k + 1}`}>{k + 1}</span>}
            <div className="grow"><TokenArea def={def} label={`Option ${k + 1}`} tokens="decision" rows={2} value={o.text} onChange={(v) => setOpt(i, (x) => { x.text = v; })} preview={false} /></div>
            <div className="stack" style={{ '--gap': '4px' }}>
              {dp.type === 'rank' && <><Button size="sm" variant="ghost" aria-label="Move up" disabled={k === 0} onClick={() => up((p) => { const a = p.options.find((x) => x.id === o.id); const b = p.options.find((x) => (x.rank ?? -1) === k - 1); if (b) { b.rank = k; a.rank = k - 1; } })}>↑</Button><Button size="sm" variant="ghost" aria-label="Move down" disabled={k === order.length - 1} onClick={() => up((p) => { const a = p.options.find((x) => x.id === o.id); const b = p.options.find((x) => (x.rank ?? -1) === k + 1); if (b) { b.rank = k; a.rank = k + 1; } })}>↓</Button></>}
              {dp.type !== 'rank' && <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>}
              <Button size="sm" variant="ghost" onClick={() => del(i)} disabled={opts.length <= 2} aria-label={`Remove option ${k + 1}`}>Remove</Button>
            </div>
          </div>
          <div className="row" style={{ '--gap': '14px' }}>
            {o.style ? (
              <Field label="Style">
                <select className="select" value={o.style} onChange={(e) => setOpt(i, (x) => { x.style = e.target.value; })}>{styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Field>
            ) : (dp.type === 'single' || dp.type === 'scenario') ? (
              <Field label="How good is it" hint={`${o.quality ?? 50} of 100 · ${BANDS.find((b) => b.id === bandOf(o.quality ?? 50)).label}`}>
                <input type="range" min={0} max={100} step={5} value={o.quality ?? 50} onChange={(e) => setOpt(i, (x) => { x.quality = Number(e.target.value); })} aria-label={`Quality of option ${k + 1}`} />
              </Field>
            ) : dp.type === 'multi' ? (
              <Switch checked={!!o.correct} onChange={(v) => setOpt(i, (x) => { x.correct = v; })} label="A right choice" />
            ) : null}
          </div>
          {(dp.type === 'single' || dp.type === 'scenario') && !o.style && (
            <details className="option-more">
              <summary className="small">Reaction, feedback and consequences{o.consequences ? ` · ${consSummary(def, dp, o.consequences)}` : ''}</summary>
              <div className="stack" style={{ '--gap': '8px', paddingTop: 8 }}>
                <TokenArea def={def} label="How the sender reacts" tokens="decision" rows={2} value={o.reaction} onChange={(v) => setOpt(i, (x) => { x.reaction = v; })} preview={false} />
                <TokenArea def={def} label="Coach's note" tokens="decision" rows={2} value={o.feedback} onChange={(v) => setOpt(i, (x) => { x.feedback = v; })} preview={false} hint="Short and specific: why this choice worked or did not." />
                <Cons def={def} dp={dp} value={o.consequences} onChange={(c) => setOpt(i, (x) => { x.consequences = c; })} />
              </div>
            </details>
          )}
          {dp.type === 'multi' && (
            <details className="option-more">
              <summary className="small">Consequences of picking it{o.consequences ? ` · ${consSummary(def, dp, o.consequences)}` : ''}</summary>
              <div style={{ paddingTop: 8 }}><Cons def={def} dp={dp} value={o.consequences} onChange={(c) => setOpt(i, (x) => { x.consequences = c; })} /></div>
            </details>
          )}
        </div>
      ))}
      <div><Button onClick={add}>Add option</Button></div>
      {dp.type === 'multi' && !opts.some((o) => o.correct) && <Callout tone="warn" icon="!">Mark at least one option as a right choice, or every answer scores zero.</Callout>}
    </div>
  );
}

function OutcomesTab({ def, dp, up }) {
  const perOption = (dp.type === 'single' || dp.type === 'scenario') && !(dp.options || []).some((o) => o.style);
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      <p className="small muted">
        {perOption ? 'Each option above has its own reaction and consequences. These band outcomes are used when an option has none of its own.' : 'The answer is scored from 0 to 100 and lands in a band: strong (70 and above), mixed (40 to 69) or weak (below 40). Each band has its own reaction, coaching note and consequences.'}
      </p>
      {BANDS.map((b) => {
        const oc = dp.outcomes?.[b.id] || {};
        const set = (fn) => up((p) => { p.outcomes ||= {}; p.outcomes[b.id] ||= {}; fn(p.outcomes[b.id]); });
        return (
          <div key={b.id} className={`card tight stack band-card band-${b.id}`} style={{ '--gap': '8px' }}>
            <div className="row spread"><strong><span className={`lx-band-dot ${b.id}`} aria-hidden="true" /> {BAND_LABEL[b.id]}</strong><span className="small muted">{b.id === 'strong' ? '70 to 100' : b.id === 'mixed' ? '40 to 69' : '0 to 39'}</span></div>
            <TokenArea def={def} label="How the sender reacts" tokens="decision" rows={2} value={oc.reaction} onChange={(v) => set((x) => { x.reaction = v; })} preview={false} />
            <TokenArea def={def} label="Coach's note" tokens="decision" rows={2} value={oc.feedback} onChange={(v) => set((x) => { x.feedback = v; })} preview={false} />
            <Cons def={def} dp={dp} value={oc.consequences} onChange={(c) => set((x) => { x.consequences = c; })} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- open responses ----------

function OpenTab({ def, dp, up, notify }) {
  const sample = useSample();
  const o = dp.open || {};
  const crit = o.criteria?.length ? o.criteria : DEFAULT_CRITERIA;
  const total = crit.reduce((t, c) => t + Number(c.weight || 0), 0);
  const [busy, setBusy] = useState('');
  const setOpen = (fn) => up((p) => { p.open ||= { minWords: 25, criteria: suggestCriteria(p), keyIdeas: [], modelAnswer: '' }; fn(p.open, p); });
  const unused = DEFAULT_CRITERIA.filter((c) => !crit.some((x) => x.id === c.id));

  const genieCriteria = async () => {
    setBusy('criteria');
    try {
      const r = await sample.json([
        'You design evaluation criteria for open responses in a leadership simulation.',
        `Situation: ${renderText(def, dp.situation, textVars(def, null, dp))}`,
        `Question: ${renderText(def, dp.prompt, textVars(def, null, dp))}`,
        o.modelAnswer ? `Strong answer: ${renderText(def, o.modelAnswer, textVars(def, null, dp))}` : '',
        `Use these criterion ids only: ${DEFAULT_CRITERIA.map((c) => c.id).join(', ')}. Weights add up to 100.`,
        'Reply with only JSON: {"criteria":[{"id":string,"label":string,"description":string (one sentence specific to this situation),"weight":number}],"keyIdeas":[{"label":string (short),"terms":[string] (3 to 6 lowercase words or phrases a learner might use)}] (3 to 5 ideas)}. No em dashes.',
      ].filter(Boolean).join('\n'), { cache: false });
      const list = (r?.criteria || []).filter((c) => CRITERIA_LIBRARY[c.id]);
      if (!list.length) throw new Error('empty');
      setOpen((x) => {
        x.criteria = list.map((c) => ({ id: c.id, label: String(c.label || CRITERIA_LIBRARY[c.id].label), description: String(c.description || ''), weight: Math.max(0, Math.round(Number(c.weight) || 0)) }));
        if (Array.isArray(r.keyIdeas) && r.keyIdeas.length) x.keyIdeas = r.keyIdeas.slice(0, 6).map((k) => ({ label: String(k.label), terms: (k.terms || []).map(String).slice(0, 8) }));
      });
      notify('Genie wrote criteria and key ideas for this moment. Review them below.');
    } catch { notify('Genie could not write criteria this time. The built-in suggestion is still available.'); }
    setBusy('');
  };

  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="card tight stack" style={{ '--gap': '8px' }}>
        <div className="row spread">
          <h3>Evaluation criteria</h3>
          <div className="row">
            <Button size="sm" onClick={() => setOpen((x, p) => { x.criteria = suggestCriteria(p); })} tip="Weights the six standard criteria for what this moment practises.">Suggest criteria</Button>
            {sample && <Button size="sm" variant="ghost" disabled={!!busy} onClick={genieCriteria}>{busy === 'criteria' ? 'Genie is writing…' : 'Write with Genie'}</Button>}
          </div>
        </div>
        <p className="small muted">Every answer is scored on each criterion from 0 to 100, then weighted. Weights: {total}{total !== 100 ? ' (they are scaled to 100)' : ''}.</p>
        {crit.map((c, i) => (
          <div key={c.id} className="crit-row">
            <input className="input" value={c.label} aria-label="Criterion" onChange={(e) => setOpen((x) => { x.criteria ||= crit.map((y) => ({ ...y })); x.criteria[i].label = e.target.value; })} />
            <input className="input" value={c.description || ''} aria-label={`What ${c.label} means here`} placeholder="What a good answer does" onChange={(e) => setOpen((x) => { x.criteria ||= crit.map((y) => ({ ...y })); x.criteria[i].description = e.target.value; })} />
            <label className="row nowrap small" style={{ '--gap': '4px' }}><NumberInput className="xs" value={c.weight} min={0} max={100} onChange={(v) => setOpen((x) => { x.criteria ||= crit.map((y) => ({ ...y })); x.criteria[i].weight = v; })} aria-label={`Weight of ${c.label}`} />%</label>
            <Button size="sm" variant="ghost" disabled={crit.length <= 1} onClick={() => setOpen((x) => { x.criteria = crit.filter((_, k) => k !== i).map((y) => ({ ...y })); })} aria-label={`Remove ${c.label}`}>Remove</Button>
          </div>
        ))}
        {unused.length > 0 && (
          <div className="row small"><span className="muted">Add:</span>{unused.map((c) => <Button key={c.id} size="sm" variant="ghost" onClick={() => setOpen((x) => { x.criteria = [...crit.map((y) => ({ ...y })), { ...c }]; })}>{c.label}</Button>)}</div>
        )}
      </div>

      <div className="card tight stack" style={{ '--gap': '8px' }}>
        <TokenArea def={def} label="A strong answer" tokens="decision" rows={4} value={o.modelAnswer} onChange={(v) => setOpen((x) => { x.modelAnswer = v; })} hint="Used to calibrate scoring, shown in author x-ray and in the debrief as an example." />
        <div className="row spread">
          <h3>Key ideas</h3>
          <Button size="sm" disabled={!o.modelAnswer} onClick={() => setOpen((x) => { x.keyIdeas = draftKeyIdeas(x.modelAnswer); })} tip="One key idea per sentence of the strong answer, with its distinctive words as the words to look for.">Draft from the strong answer</Button>
        </div>
        <p className="small muted">The ideas a strong answer covers. The built-in evaluator looks for any of the words listed; Genie reads for the idea itself.</p>
        {(o.keyIdeas || []).map((k, i) => (
          <div key={i} className="idea-row">
            <input className="input" value={k.label} aria-label={`Key idea ${i + 1}`} onChange={(e) => setOpen((x) => { x.keyIdeas[i].label = e.target.value; })} />
            <input className="input" value={(k.terms || []).join(', ')} aria-label={`Words that show key idea ${i + 1}`} placeholder="words to look for, comma separated" onChange={(e) => setOpen((x) => { x.keyIdeas[i].terms = e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean); })} />
            <Button size="sm" variant="ghost" onClick={() => setOpen((x) => { x.keyIdeas.splice(i, 1); })} aria-label={`Remove key idea ${i + 1}`}>Remove</Button>
          </div>
        ))}
        <div><Button size="sm" onClick={() => setOpen((x) => { x.keyIdeas = [...(x.keyIdeas || []), { label: 'New idea', terms: [] }]; })}>Add key idea</Button></div>
        <div className="row"><span className="small">Ask for at least</span><NumberInput className="xs" value={o.minWords || 25} min={5} max={400} onChange={(v) => setOpen((x) => { x.minWords = v; })} aria-label="Minimum words" /><span className="small muted">words. Much shorter answers are capped at a weak score.</span></div>
        <Field label="Who scores the answers">
          <Seg label="Evaluator" value={def.decisions.nlp?.evaluator || 'auto'} onChange={(v) => up((p, d) => { d.decisions.nlp = { ...(d.decisions.nlp || {}), evaluator: v }; })} options={[{ value: 'auto', label: 'Genie, with built-in fallback' }, { value: 'rules', label: 'Built-in only' }]} />
        </Field>
        <p className="small muted">{(def.decisions.nlp?.evaluator || 'auto') === 'auto' ? 'Genie reads each answer against these criteria when it is available, and the built-in evaluator scores it instantly when it is not. Applies to every open moment.' : 'Every answer is scored instantly by the built-in evaluator, the same way every time. Applies to every open moment.'}</p>
      </div>

      <TryIt def={def} dp={dp} sample={sample} />
    </div>
  );
}

function TryIt({ def, dp, sample }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const vars = textVars(def, null, dp);
  const run = async (useGenie) => {
    const rules = evaluateOpen(def, dp, text, { vars });
    if (!useGenie) { setRes(rules); return; }
    setBusy(true);
    try { setRes(parseGenieEval(def, dp, await sample.json(openEvalPrompt(def, dp, text, vars), { cache: false }), rules)); } catch { setRes({ ...rules, note: 'Genie did not answer, so this is the built-in score.' }); }
    setBusy(false);
  };
  return (
    <div className="card tight stack" style={{ '--gap': '8px' }}>
      <h3>Try an answer</h3>
      <p className="small muted">Write an answer as a learner might, and see how it scores and what feedback it gets.</p>
      <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a learner's answer…" aria-label="Test answer" />
      <div className="row">
        <Button size="sm" disabled={text.trim().split(/\s+/).length < 3} onClick={() => run(false)}>Score it</Button>
        {sample && <Button size="sm" variant="ghost" disabled={busy || text.trim().split(/\s+/).length < 3} onClick={() => run(true)}>{busy ? 'Genie is reading…' : 'Score with Genie'}</Button>}
        {dp.open?.modelAnswer && <Button size="sm" variant="ghost" onClick={() => { const t = renderText(def, dp.open.modelAnswer, vars); setText(t); setRes(evaluateOpen(def, dp, t, { vars })); }}>Try the strong answer</Button>}
      </div>
      {res && (
        <div className="stack" style={{ '--gap': '6px' }} aria-live="polite">
          <div className="row"><strong className="num" style={{ fontSize: 22 }}>{res.score}</strong><span className={`lx-band-dot ${bandOf(res.score)}`} aria-hidden="true" /><span>{BAND_LABEL[bandOf(res.score)]}</span><span className="small muted">· {res.by === 'genie' ? 'Genie' : 'built-in evaluator'}</span></div>
          {res.note && <p className="small muted">{res.note}</p>}
          <div className="lx-criteria">
            {res.criteria.map((c) => (
              <div key={c.id} className="lx-crit" title={c.note}><span>{c.label}</span><span className="lx-crit-track"><span style={{ width: `${c.score}%` }} className={c.score >= 70 ? 'good' : c.score >= 40 ? 'mid' : 'low'} /></span><span className="num">{c.score}</span></div>
            ))}
          </div>
          {res.ideas?.length > 0 && <ul className="lx-ideas">{res.ideas.map((i) => <li key={i.label} className={i.met ? 'met' : ''}><span aria-hidden="true">{i.met ? '✓' : '○'}</span> {i.label}</li>)}</ul>}
          <p className="small">{res.feedback}</p>
        </div>
      )}
    </div>
  );
}

// ---------- branching ----------

export function allFlags(def) {
  const set = new Set();
  for (const p of def.decisions?.points || []) {
    for (const o of p.options || []) for (const f of o.consequences?.flags || []) set.add(f);
    for (const oc of Object.values(p.outcomes || {})) for (const f of oc?.consequences?.flags || []) set.add(f);
  }
  return [...set];
}

function CondEditor({ def, dp, value, onChange, allowNone = true }) {
  const kind = !value ? 'always' : value.flag ? 'flag' : value.notFlag ? 'notFlag' : value.decision ? 'decision' : value.kpiBelow ? 'kpiBelow' : value.kpiAbove ? 'kpiAbove' : 'always';
  const flags = allFlags(def);
  const others = (def.decisions?.points || []).filter((p) => p.id !== dp.id && (p.week < dp.week || (p.week === dp.week && p.day < dp.day)));
  const kpis = def.decisions?.kpis || [];
  const setKind = (k) => onChange(k === 'always' ? undefined : k === 'flag' ? { flag: flags[0] || '' } : k === 'notFlag' ? { notFlag: flags[0] || '' } : k === 'decision' ? { decision: others.at(-1)?.id || '', band: ['strong'] } : { [k]: { id: kpis[0]?.id || 'trust', value: 40 } });
  return (
    <div className="stack" style={{ '--gap': '6px' }}>
      <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Condition">
        {allowNone && <option value="always">Always</option>}
        <option value="flag" disabled={!flags.length}>After a choice the learner made</option>
        <option value="notFlag" disabled={!flags.length}>Unless the learner made a choice</option>
        <option value="decision" disabled={!others.length}>Depending on how an earlier moment went</option>
        <option value="kpiBelow">If a KPI is below a value</option>
        <option value="kpiAbove">If a KPI is above a value</option>
      </select>
      {(kind === 'flag' || kind === 'notFlag') && (
        <select className="select" value={value[kind]} onChange={(e) => onChange({ [kind]: e.target.value })} aria-label="Choice">
          {flags.map((f) => <option key={f} value={f}>{flagLabel(def, f)}</option>)}
        </select>
      )}
      {kind === 'decision' && (
        <div className="row">
          <select className="select" value={value.decision} onChange={(e) => onChange({ ...value, decision: e.target.value })} aria-label="Earlier moment">
            {others.map((p) => <option key={p.id} value={p.id}>W{p.week}: {renderText(def, p.title, textVars(def, null, p))}</option>)}
          </select>
          <span className="small">was</span>
          {BANDS.map((b) => {
            const on = [].concat(value.band || []).includes(b.id);
            return <label key={b.id} className="row nowrap small" style={{ '--gap': '4px' }}><input type="checkbox" checked={on} onChange={() => onChange({ ...value, band: on ? [].concat(value.band).filter((x) => x !== b.id) : [...[].concat(value.band || []), b.id] })} />{b.label.toLowerCase()}</label>;
          })}
        </div>
      )}
      {(kind === 'kpiBelow' || kind === 'kpiAbove') && (
        <div className="row">
          <select className="select" value={value[kind].id} onChange={(e) => onChange({ [kind]: { ...value[kind], id: e.target.value } })} aria-label="KPI">{kpis.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          <span className="small">{kind === 'kpiBelow' ? 'below' : 'above'}</span>
          <NumberInput className="xs" value={value[kind].value} min={0} max={100} onChange={(v) => onChange({ [kind]: { ...value[kind], value: v } })} aria-label="Value" />
        </div>
      )}
    </div>
  );
}

function BranchingTab({ def, dp, up, points, update }) {
  const siblings = points.filter((p) => p.id !== dp.id && (p.slot || p.id) === (dp.slot || '#none'));
  const candidates = points.filter((p) => p.id !== dp.id && p.week === dp.week);
  const setsFlags = [...new Set([...(dp.options || []).flatMap((o) => o.consequences?.flags || []), ...Object.values(dp.outcomes || {}).flatMap((o) => o?.consequences?.flags || [])])];
  const usedBy = (f) => points.filter((p) => JSON.stringify(p.requires || '').includes(`"${f}"`) || (p.variants || []).some((v) => JSON.stringify(v.when || '').includes(`"${f}"`)) || (p.options || []).some((o) => JSON.stringify(o.requires || '').includes(`"${f}"`)));
  const later = points.filter((p) => p.requires?.decision === dp.id || (p.variants || []).some((v) => v.when?.decision === dp.id));
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="card tight stack" style={{ '--gap': '8px' }}>
        <h3>When this moment appears</h3>
        <CondEditor def={def} dp={dp} value={dp.requires} onChange={(c) => up((p) => { p.requires = c; })} />
        <p className="small muted">{describeCondition(def, dp.requires)}.</p>
        <Field label="Alternative to" hint="Moments that replace each other: the learner sees only the one whose condition is true. They count once in the mix.">
          <select className="select" value={siblings[0]?.id || ''} onChange={(e) => update((d) => {
            const me = d.decisions.points.find((x) => x.id === dp.id);
            const other = d.decisions.points.find((x) => x.id === e.target.value);
            if (!other) { delete me.slot; return; }
            other.slot ||= `slot-${other.id}`;
            me.slot = other.slot;
          })}>
            <option value="">Not an alternative</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{renderText(def, p.title, textVars(def, null, p))}</option>)}
          </select>
        </Field>
      </div>

      <div className="card tight stack" style={{ '--gap': '8px' }}>
        <div className="row spread"><h3>Situation variants</h3><Button size="sm" onClick={() => up((p) => { p.variants = [...(p.variants || []), { when: undefined, text: p.situation }]; })}>Add variant</Button></div>
        <p className="small muted">Earlier decisions change how this situation reads. The first variant whose condition is true replaces the situation.</p>
        {(dp.variants || []).map((v, i) => (
          <div key={i} className="card tight stack" style={{ '--gap': '6px' }}>
            <CondEditor def={def} dp={dp} value={v.when} allowNone={false} onChange={(c) => up((p) => { p.variants[i].when = c; })} />
            <TokenArea def={def} label={`Variant ${i + 1}`} tokens="decision" rows={3} value={v.text} onChange={(t) => up((p) => { p.variants[i].text = t; })} preview={false} />
            <div><Button size="sm" variant="ghost" onClick={() => up((p) => { p.variants.splice(i, 1); })}>Remove variant</Button></div>
          </div>
        ))}
      </div>

      <div className="card tight stack" style={{ '--gap': '6px' }}>
        <h3>What this moment changes later</h3>
        {setsFlags.length === 0 && later.length === 0 && <p className="small muted">Nothing later depends on this moment yet. To branch, add a "remember as" choice in an option's consequences, then use it in a later moment's condition.</p>}
        {setsFlags.map((f) => <p key={f} className="small">Remembers <strong>{f}</strong>{usedBy(f).length ? `, used by ${usedBy(f).map((p) => `"${renderText(def, p.title, textVars(def, null, p))}"`).join(', ')}` : ', not used by any moment yet'}.</p>)}
        {later.map((p) => <p key={p.id} className="small">"{renderText(def, p.title, textVars(def, null, p))}" depends on how this moment went.</p>)}
      </div>
    </div>
  );
}

// ---------- recall ----------

function RecallTab({ def, dp, up }) {
  const list = dp.recall || [];
  const set = (i, fn) => up((p) => fn(p.recall[i]));
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      <p className="small muted">Short questions asked in a later week's wrap-up, so the idea behind this moment is recalled after a gap (spaced retrieval). If you leave this empty, the built-in style questions are used.</p>
      {list.map((q, i) => (
        <div key={i} className="card tight stack" style={{ '--gap': '8px' }}>
          <TextInput label={`Question ${i + 1}`} value={q.q} onChange={(v) => set(i, (x) => { x.q = v; })} />
          {q.options.map((o, k) => (
            <div key={o.id} className="row nowrap">
              <input type="radio" name={`recall-${dp.id}-${i}`} checked={q.answer === o.id} onChange={() => set(i, (x) => { x.answer = o.id; })} aria-label={`Answer ${k + 1} is right`} />
              <input className="input grow" value={o.text} onChange={(e) => set(i, (x) => { x.options[k].text = e.target.value; })} aria-label={`Answer ${k + 1}`} />
              <Button size="sm" variant="ghost" disabled={q.options.length <= 2} onClick={() => set(i, (x) => { x.options.splice(k, 1); if (x.answer === o.id) x.answer = x.options[0].id; })}>Remove</Button>
            </div>
          ))}
          <div className="row"><Button size="sm" onClick={() => set(i, (x) => { x.options.push({ id: newId('r'), text: 'Another answer' }); })}>Add answer</Button><Button size="sm" variant="ghost" onClick={() => up((p) => { p.recall.splice(i, 1); })}>Remove question</Button></div>
          <TextInput label="Explanation shown after answering" value={q.explain} onChange={(v) => set(i, (x) => { x.explain = v; })} />
        </div>
      ))}
      <div><Button onClick={() => up((p) => { p.recall = [...(p.recall || []), { q: 'What matters most in this situation?', options: [{ id: 'a', text: 'The right answer' }, { id: 'b', text: 'A tempting wrong answer' }, { id: 'c', text: 'Another wrong answer' }], answer: 'a', explain: '' }]; })}>Add recall question</Button></div>
    </div>
  );
}

// ---------- consequences ----------

export function consSummary(def, dp, c) {
  if (!c) return 'no change';
  const parts = [];
  const who = (id) => def.actors.find((a) => a.id === id)?.name?.split(' ')[0];
  if (c.actor && impactText(c.actor) !== 'no change') parts.push(`${who(dp.about) || 'the person'}: ${impactText(c.actor)}`);
  if (c.actor2 && impactText(c.actor2) !== 'no change') parts.push(`${who(dp.about2) || 'second person'}: ${impactText(c.actor2)}`);
  if (c.team && impactText(c.team) !== 'no change') parts.push(`team: ${impactText(c.team)}`);
  for (const [k, v] of Object.entries(c.kpis || {})) if (v) parts.push(`${kpiLabel(def, k)} ${v > 0 ? '+' : ''}${v}`);
  if (c.flags?.length) parts.push(`remembers ${c.flags.join(', ')}`);
  for (const d of c.delayed || []) parts.push(`in ${d.weeks || 1} week${(d.weeks || 1) === 1 ? '' : 's'}: ${d.title}`);
  return parts.join(' · ') || 'no change';
}

function Cons({ def, dp, value, onChange }) {
  const [open, setOpen] = useState(false);
  const c = value || {};
  const set = (patch) => onChange({ ...c, ...patch });
  const kpis = def.decisions?.kpis || [];
  const who = (id) => def.actors.find((a) => a.id === id)?.name;
  return (
    <div className="cons">
      <button type="button" className="cons-head small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="eyebrow">Consequences</span> <span className="ink2">{consSummary(def, dp, value)}</span> <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="stack cons-body" style={{ '--gap': '8px' }}>
          {dp.about && <div className="row spread"><span className="small">{who(dp.about)} (skill, morale, performance)</span><ImpactInputs value={c.actor || EMPTY_IMPACT} onChange={(v) => set({ actor: v })} /></div>}
          {dp.about2 && <div className="row spread"><span className="small">{who(dp.about2)}</span><ImpactInputs value={c.actor2 || EMPTY_IMPACT} onChange={(v) => set({ actor2: v })} /></div>}
          <div className="row spread"><span className="small">Everyone on the team</span><ImpactInputs value={c.team || EMPTY_IMPACT} onChange={(v) => set({ team: v })} /></div>
          {kpis.map((k) => (
            <div key={k.id} className="row spread"><span className="small">{k.label}</span><NumberInput className="xs" value={c.kpis?.[k.id] || 0} min={-50} max={50} onChange={(v) => set({ kpis: { ...(c.kpis || {}), [k.id]: v } })} aria-label={k.label} /></div>
          ))}
          <TextInput label="Remember as" hint="A short name later moments can branch on, e.g. backed-first. Separate several with commas." value={(c.flags || []).join(', ')} onChange={(v) => set({ flags: v.split(',').map((x) => x.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean) })} />
          <div className="stack" style={{ '--gap': '6px' }}>
            <span className="small"><strong>Later consequences</strong> <span className="muted">arrive in the learner's inbox weeks after the decision.</span></span>
            {(c.delayed || []).map((d, i) => {
              const setD = (patch) => set({ delayed: c.delayed.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="card tight stack" style={{ '--gap': '6px' }}>
                  <div className="row"><span className="small">After</span><NumberInput className="xs" value={d.weeks || 1} min={1} max={def.timeline.weeks} onChange={(v) => setD({ weeks: v })} aria-label="Weeks later" /><span className="small">weeks</span><div className="grow"><input className="input" value={d.title || ''} onChange={(e) => setD({ title: e.target.value })} aria-label="Title" placeholder="Title" /></div></div>
                  <textarea className="textarea" rows={2} value={d.text || ''} onChange={(e) => setD({ text: e.target.value })} aria-label="What happens" />
                  <div className="row spread"><span className="small">Team</span><ImpactInputs value={d.team || EMPTY_IMPACT} onChange={(v) => setD({ team: v })} /></div>
                  {kpis.map((k) => <div key={k.id} className="row spread"><span className="small">{k.label}</span><NumberInput className="xs" value={d.kpis?.[k.id] || 0} min={-50} max={50} onChange={(v) => setD({ kpis: { ...(d.kpis || {}), [k.id]: v } })} aria-label={k.label} /></div>)}
                  <div><Button size="sm" variant="ghost" onClick={() => set({ delayed: c.delayed.filter((_, k) => k !== i) })}>Remove</Button></div>
                </div>
              );
            })}
            <div><Button size="sm" onClick={() => set({ delayed: [...(c.delayed || []), { weeks: 2, title: 'It comes back', text: '', team: { s: 0, m: -2, p: 0 } }] })}>Add later consequence</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- scoring and KPIs ----------

function ScoringTab({ def, update }) {
  const w = { ...DEFAULT_SCORING, ...(def.scoring || {}) };
  const total = Object.values(w).reduce((t, v) => t + v, 0) || 1;
  const kpis = def.decisions?.kpis || [];
  const g = def.gamification || {};
  const LABELS = { results: 'Business results (conversions against target)', leadership: 'Leadership of the team (the competencies)', decisions: 'Quality of decisions (every moment)', recall: 'Recall of key ideas (quick questions)' };
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="card stack" style={{ '--gap': '10px' }}>
        <h3>Final score</h3>
        <p className="small muted">The learner's overall score out of 100 combines four parts. Tiers: {TIERS.map((t) => `${t.label} ${t.min}+`).join(', ')}. The pass mark for LMS reporting is in Settings and delivery.</p>
        {Object.keys(DEFAULT_SCORING).map((k) => (
          <div key={k} className="row spread">
            <span className="small">{LABELS[k]}</span>
            <span className="row nowrap"><input type="range" min={0} max={60} step={5} value={w[k]} onChange={(e) => update((d) => { d.scoring = { ...w, [k]: Number(e.target.value) }; })} aria-label={LABELS[k]} /><strong className="num" style={{ width: 44, textAlign: 'right' }}>{Math.round((w[k] / total) * 100)}%</strong></span>
          </div>
        ))}
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row spread"><h3>Business KPIs</h3><Button size="sm" onClick={() => update((d) => { d.decisions.kpis.push({ id: newId('kpi'), label: 'New KPI', start: 50, note: '' }); })}>Add KPI</Button></div>
        <p className="small muted">Numbers the learner sees move with their decisions, besides conversions and morale. Consequences change them; branching can depend on them.</p>
        {kpis.map((k, i) => (
          <div key={k.id} className="kpi-row">
            <input className="input" value={k.label} onChange={(e) => update((d) => { d.decisions.kpis[i].label = e.target.value; })} aria-label="KPI name" />
            <label className="row nowrap small" style={{ '--gap': '4px' }}>starts at <NumberInput className="xs" value={k.start} min={0} max={100} onChange={(v) => update((d) => { d.decisions.kpis[i].start = v; })} aria-label={`${k.label} start`} /></label>
            <input className="input" value={k.note || ''} placeholder="What it means" onChange={(e) => update((d) => { d.decisions.kpis[i].note = e.target.value; })} aria-label={`${k.label} meaning`} />
            <Button size="sm" variant="ghost" disabled={kpis.length <= 1} onClick={() => update((d) => { d.decisions.kpis.splice(i, 1); })}>Remove</Button>
          </div>
        ))}
      </div>

      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Game elements</h3>
        <p className="small muted">They reward the behaviours the simulation teaches, never speed or guessing.</p>
        <Switch checked={g.xp !== false} onChange={(v) => update((d) => { d.gamification = { ...g, xp: v }; })} label="Experience points for every decision, weighted by difficulty" />
        <Switch checked={g.achievements !== false} onChange={(v) => update((d) => { d.gamification = { ...g, achievements: v }; })} label="Achievements for good leadership habits (reading the room, recovering from a mistake, recall)" />
        <Switch checked={g.benchmarks !== false} onChange={(v) => update((d) => { d.gamification = { ...g, benchmarks: v }; })} label="Show the learner how they compare with others in the debrief" />
      </div>
    </div>
  );
}

// ---------- learning design ----------

function LearningTab({ def, update }) {
  const l = def.learning || {};
  const set = (patch) => update((d) => { d.learning = { ...(d.learning || {}), ...patch }; });
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Retention</h3>
        <Switch checked={l.recall !== false} onChange={(v) => set({ recall: v })} label="Quick recall in each Friday wrap-up, spaced across earlier concepts" />
        <Switch checked={l.hints !== false} onChange={(v) => set({ hints: v })} label="Offer a hint on introductory open responses" />
        <div className="row"><span className="small">Rethinks allowed per run</span><NumberInput className="xs" value={l.rewinds ?? 2} min={0} max={10} onChange={(v) => set({ rewinds: v })} aria-label="Rethinks" /><span className="small muted">A learner can undo a decision that did not land and try again. Retries count in the debrief.</span></div>
      </div>
      <div className="card stack" style={{ '--gap': '8px' }}>
        <div className="row spread"><h3>Reflections</h3><Switch checked={l.reflection !== false} onChange={(v) => set({ reflection: v })} label="On" /></div>
        <p className="small muted">Asked at the end of a week. Answers stay private to the learner and appear in their debrief.</p>
        {(l.reflections || []).map((r, i) => (
          <div key={r.id} className="row nowrap">
            <label className="row nowrap small" style={{ '--gap': '4px' }}>Week <NumberInput className="xs" value={r.week} min={1} max={def.timeline.weeks} onChange={(v) => update((d) => { d.learning.reflections[i].week = v; })} aria-label="Week" /></label>
            <input className="input grow" value={r.prompt} onChange={(e) => update((d) => { d.learning.reflections[i].prompt = e.target.value; })} aria-label={`Reflection ${i + 1}`} />
            <Button size="sm" variant="ghost" onClick={() => update((d) => { d.learning.reflections.splice(i, 1); })}>Remove</Button>
          </div>
        ))}
        <div><Button size="sm" onClick={() => update((d) => { d.learning.reflections = [...(d.learning.reflections || []), { id: newId('r'), week: Math.ceil(d.timeline.weeks / 2), prompt: 'What have you learned about your team this week?' }]; })}>Add reflection</Button></div>
      </div>
      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Back at work</h3>
        <p className="small muted">Prompts in the debrief that connect the simulation to the learner's real team.</p>
        {(l.transfer || []).map((t, i) => (
          <div key={i} className="row nowrap">
            <input className="input grow" value={t} onChange={(e) => update((d) => { d.learning.transfer[i] = e.target.value; })} aria-label={`Prompt ${i + 1}`} />
            <Button size="sm" variant="ghost" onClick={() => update((d) => { d.learning.transfer.splice(i, 1); })}>Remove</Button>
          </div>
        ))}
        <div><Button size="sm" onClick={() => update((d) => { d.learning.transfer = [...(d.learning.transfer || []), 'Who in your team would benefit from a different approach this week?']; })}>Add prompt</Button></div>
      </div>
    </div>
  );
}
