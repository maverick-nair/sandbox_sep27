// "Things you can do this week": the template's leadership actions, each costing days.
import { useMemo, useState } from 'react';
import { actionAvailability, availableIds, stageName, daysLeftInWeek, desiredStyle } from '../engine/engine.js';
import { renderText } from '../engine/text.js';
import { Avatar } from './Moment.jsx';

const daysLabel = (a) => {
  const days = [...new Set(a.options.map((o) => o.dayCost))];
  return `${days.join(' or ')} day${days.length === 1 && days[0] === 1 ? '' : 's'}`;
};

export function ActionGrid({ def, state, onPick }) {
  return (
    <div className="lx-actions">
      {def.actions.filter((a) => a.enabled).map((a) => {
        const av = a.options.map((o) => actionAvailability(def, state, a, o));
        const ok = av.some((x) => x.ok);
        return (
          <button key={a.id} type="button" className="lx-action" disabled={!ok} onClick={() => onPick(a.id)} title={ok ? renderText(def, a.description) : av[0].reason}>
            <strong>{a.name}</strong>
            <span className="small muted">{ok ? daysLabel(a) : av[0].reason}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ActionComposer({ def, state, action, xray, onCancel, onSubmit }) {
  const usable = action.options.filter((o) => actionAvailability(def, state, action, o).ok);
  const [optionId, setOptionId] = useState(usable[0]?.id);
  const [targets, setTargets] = useState([]);
  const [stage, setStage] = useState('');
  const [candidate, setCandidate] = useState('');
  const option = action.options.find((o) => o.id === optionId);
  const ids = availableIds(state);
  const pool = useMemo(() => Object.values(state.actors).filter((a) => a.status === 'pool'), [state]);
  const max = action.mechanic === 'roleChange' ? (option?.mode === 'swap' ? 2 : 1) : action.maxTargets || 1;
  const needsStage = action.mechanic === 'hire' || (action.mechanic === 'roleChange' && option?.mode === 'reassign') || action.mechanic === 'assess';
  const toggle = (id) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : max === 1 ? [id] : t.length < max ? [...t, id] : t));
  const left = daysLeftInWeek(def, state);
  return (
    <div className="lx-composer">
      <div className="row spread"><h3>{action.name}</h3><button type="button" className="btn ghost sm" onClick={onCancel}>Back</button></div>
      <p className="small ink2">{renderText(def, action.description)}</p>
      {action.options.length > 1 && (
        <div className="stack" style={{ '--gap': '6px' }} role="radiogroup" aria-label="How">
          {action.options.map((o) => {
            const av = actionAvailability(def, state, action, o);
            return (
              <label key={o.id} className={`lx-option ${optionId === o.id ? 'on' : ''}`} style={{ cursor: av.ok ? 'pointer' : 'not-allowed', opacity: av.ok ? 1 : 0.5 }}>
                <input type="radio" name="opt" disabled={!av.ok} checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="sr-only" />
                <span>{o.text ? renderText(def, o.text) : o.label} <span className="muted small">· {o.dayCost} day{o.dayCost === 1 ? '' : 's'}{!av.ok ? ` · ${av.reason}` : ''}</span></span>
                {xray && o.style && <span className="lx-xray-tag">{def.leadership.styles.find((s) => s.id === o.style)?.name}</span>}
              </label>
            );
          })}
        </div>
      )}
      {action.scope !== 'team' && action.mechanic !== 'hire' && (
        <div className="stack" style={{ '--gap': '6px' }}>
          <span className="small" style={{ fontWeight: 600 }}>{action.selectPrompt ? renderText(def, action.selectPrompt) : `Who? Pick up to ${max}`} <span className="muted">({targets.length}/{max})</span></span>
          <div className="lx-people-pick">
            {ids.map((id) => {
              const a = state.actors[id];
              return (
                <button key={id} type="button" className={`lx-person-chip ${targets.includes(id) ? 'on' : ''}`} aria-pressed={targets.includes(id)} onClick={() => toggle(id)}>
                  <Avatar name={a.name} size={22} /> {a.name.split(' ')[0]} <span className="muted small">{stageName(def, a.stage)}</span>
                  {xray && <span className="lx-xray-tag">{def.leadership.styles.find((s) => s.id === desiredStyle(def, a.s, a.m))?.name}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {action.mechanic === 'hire' && (
        <div className="stack" style={{ '--gap': '6px' }}>
          <span className="small" style={{ fontWeight: 600 }}>Candidates</span>
          {pool.map((a) => {
            const src = def.actors.find((x) => x.id === a.id);
            return (
              <label key={a.id} className={`lx-option ${candidate === a.id ? 'on' : ''}`}>
                <input type="radio" name="cand" className="sr-only" checked={candidate === a.id} onChange={() => setCandidate(a.id)} />
                <span className="small"><strong>{a.name}</strong> · {src.experience} · {src.domain}<br /><span className="ink2">{renderText(def, src.bio)}</span></span>
              </label>
            );
          })}
        </div>
      )}
      {needsStage && (
        <label className="field">
          <span className="label">{action.mechanic === 'assess' ? 'Assess for stage (optional)' : 'Stage'}</span>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">{action.mechanic === 'assess' ? 'Current stage' : 'Pick a stage'}</option>
            {def.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <div className="row spread">
        <span className="small muted">{left} day{left === 1 ? '' : 's'} left this week</span>
        <button type="button" className="btn primary" disabled={!option} onClick={() => onSubmit({ actionId: action.id, optionId, targets, stage: stage || undefined, candidate: candidate || undefined })}>
          Do it ({option?.dayCost || 1} day{option?.dayCost === 1 ? '' : 's'})
        </button>
      </div>
    </div>
  );
}
