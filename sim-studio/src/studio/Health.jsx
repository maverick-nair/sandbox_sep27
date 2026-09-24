// Health check with a suggested fix for every issue. Each fix is drafted from the simulation
// itself; the author applies it as it is, edits the values first, or asks Genie to rewrite text.
import { useMemo, useState } from 'react';
import { validate } from '../engine/validate.js';
import { TEMPLATES } from '../templates/registry.js';
import { Button, Callout, Drawer, Field, NumberInput, Pill, Switch, TextInput, TokenArea } from './ui.jsx';
import { useSample } from './Tailoring.jsx';

const SECTION = { overview: 'Overview', story: 'Story and context', funnel: 'Funnel and target', team: 'Team', leadership: 'Leadership model', actions: 'Actions', events: 'Events', decisions: 'Decision moments', report: 'Report', settings: 'Settings' };
const GROUPS = [
  { sev: 'error', title: 'Must fix before publishing', tone: 'bad' },
  { sev: 'warning', title: 'Worth fixing', tone: 'warn' },
  { sev: 'info', title: 'For information', tone: '' },
];

export function useSuggestions(def, issues) {
  const fixes = TEMPLATES[def.meta.templateId]?.fixes;
  return useMemo(() => (fixes ? fixes.suggestFixes(def, issues) : {}), [fixes, def, issues]);
}

export default function HealthDrawer({ def, issues, onClose, go, update, notify }) {
  const suggestions = useSuggestions(def, issues);
  const fixes = TEMPLATES[def.meta.templateId]?.fixes;
  const sample = useSample();
  const [showInfo, setShowInfo] = useState(false);
  const blocking = issues.filter((i) => i.severity !== 'info');
  const fixable = blocking.filter((i) => suggestions[i.id]);
  const errors = issues.filter((i) => i.severity === 'error').length;

  const fixAll = () => {
    if (!fixes) return;
    const result = fixes.applyAllSuggested(def, validate);
    update(() => result.def);
    const left = result.left.length;
    notify(left ? `Fixed ${fixable.length - Math.min(left, fixable.length)} issues. ${left} still need you.` : 'Everything is fixed. Use Undo at the top to reverse it.');
  };

  return (
    <Drawer title="Health check" subtitle="Every issue comes with a suggested fix. Apply it as it is, or change it first." onClose={onClose} wide>
      {issues.length === 0 && <Callout tone="good" icon="✓">No issues. Run the balance check before you publish.</Callout>}
      {blocking.length > 0 && (
        <div className="card stack health-summary">
          <div className="row spread">
            <div>
              <strong>{errors ? `${errors} to fix before publishing` : 'Nothing blocks publishing'}{blocking.length - errors ? `, ${blocking.length - errors} worth fixing` : ''}</strong>
              <p className="small muted">Each suggestion is drafted from your simulation. Read it, change anything you like, then apply. Every fix can be undone.</p>
            </div>
            {fixable.length > 1 && <Button variant="primary" onClick={fixAll}>Fix all {fixable.length} with the suggestions</Button>}
          </div>
        </div>
      )}
      <div className="stack" style={{ '--gap': '18px' }}>
        {GROUPS.map((g) => {
          const list = issues.filter((i) => i.severity === g.sev);
          if (!list.length) return null;
          const collapsed = g.sev === 'info' && !showInfo;
          return (
            <section key={g.sev} className="stack" style={{ '--gap': '10px' }}>
              <div className="row spread">
                <div className="row"><Pill tone={g.tone}>{list.length}</Pill><h3>{g.title}</h3></div>
                {g.sev === 'info' && <Button size="sm" variant="ghost" onClick={() => setShowInfo((v) => !v)}>{collapsed ? 'Show' : 'Hide'}</Button>}
              </div>
              {!collapsed && list.map((i) => (
                <IssueCard key={`${i.id}:${suggestions[i.id]?.summary || ''}`} def={def} issue={i} suggestion={suggestions[i.id]} sample={sample} update={update} notify={notify} go={go} />
              ))}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}

function IssueCard({ def, issue, suggestion, sample, update, notify, go }) {
  const initial = useMemo(() => Object.fromEntries((suggestion?.fields || []).map((f) => [f.key, f.value])), [suggestion]);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [genieMsg, setGenieMsg] = useState('');
  const changed = JSON.stringify(values) !== JSON.stringify(initial);
  const set = (k, v) => setValues((x) => ({ ...x, [k]: v }));
  const apply = () => {
    update((d) => { suggestion.apply(d, values); });
    notify(`Fixed: ${issue.title}. Undo is at the top if you change your mind.`);
  };
  const rewrite = async () => {
    const g = suggestion.genie;
    setBusy(true);
    setGenieMsg('');
    try {
      const res = await sample(g.prompt(values), { cache: false });
      const text = String(res?.text || '').trim().replace(/^"|"$/g, '');
      if (text) set(g.field, text); else setGenieMsg('Genie returned nothing. The draft is unchanged.');
    } catch (e) {
      if (e?.code !== 'cancelled') setGenieMsg(e?.code === 'rate_limited' ? 'Genie is busy. Try again in a minute.' : 'Genie could not rewrite this. The draft is unchanged.');
    }
    setBusy(false);
  };
  return (
    <div className="card tight stack issue-card" style={{ '--gap': '8px' }}>
      <div className="row spread nowrap" style={{ alignItems: 'flex-start' }}>
        <strong>{issue.title}</strong>
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{SECTION[issue.section] || issue.section}</span>
      </div>
      <p className="small ink2">{issue.detail}</p>
      {suggestion ? (
        <div className="suggestion stack" style={{ '--gap': '10px' }}>
          <div>
            <span className="eyebrow">Suggested fix</span>
            <div style={{ fontWeight: 600 }}>{suggestion.summary}</div>
            {suggestion.note && <p className="small muted">{suggestion.note}</p>}
          </div>
          {suggestion.fields.length > 0 && (
            <div className="stack" style={{ '--gap': '10px' }}>
              {suggestion.fields.map((f) => <FixField key={f.key} def={def} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />)}
            </div>
          )}
          {genieMsg && <p className="small" style={{ color: 'var(--warn)' }}>{genieMsg}</p>}
          <div className="row">
            <Button size="sm" variant="primary" onClick={apply}>{changed ? 'Apply my version' : 'Apply fix'}</Button>
            {changed && <Button size="sm" onClick={() => setValues(initial)}>Back to the suggestion</Button>}
            {suggestion.genie && sample && <Button size="sm" variant="ghost" disabled={busy} onClick={rewrite}>{busy ? 'Genie is writing…' : 'Rewrite with Genie'}</Button>}
            <button type="button" className="link-btn small" onClick={() => go(issue.section, issue.ref)}>Or fix it yourself in {SECTION[issue.section] || issue.section}</button>
          </div>
        </div>
      ) : (
        <div className="row"><Button size="sm" onClick={() => go(issue.section, issue.ref)}>Go to {SECTION[issue.section] || issue.section}</Button></div>
      )}
    </div>
  );
}

function FixField({ def, field: f, value, onChange }) {
  if (f.type === 'textarea') return <TokenArea def={def} label={f.label} value={value} rows={f.rows || 3} tokens="actor" onChange={onChange} />;
  if (f.type === 'number') return <Field label={f.label} id={`fx-${f.key}`}><NumberInput id={`fx-${f.key}`} value={value} min={f.min} max={f.max} onChange={onChange} /></Field>;
  if (f.type === 'select') {
    return (
      <Field label={f.label} id={`fx-${f.key}`}>
        <select id={`fx-${f.key}`} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    );
  }
  if (f.type === 'toggle') return <Switch checked={!!value} onChange={onChange} label={f.label} />;
  if (f.type === 'checklist') {
    const on = new Set(value || []);
    return (
      <div className="field">
        <span className="label">{f.label}</span>
        <div className="stack" style={{ '--gap': '6px' }}>
          {f.options.map((o) => (
            <label key={o.value} className="row nowrap small" style={{ alignItems: 'flex-start', '--gap': '8px' }}>
              <input type="checkbox" checked={on.has(o.value)} onChange={(e) => onChange(e.target.checked ? [...on, o.value] : [...on].filter((x) => x !== o.value))} style={{ marginTop: 3 }} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  return <TextInput label={f.label} value={value} onChange={onChange} />;
}
