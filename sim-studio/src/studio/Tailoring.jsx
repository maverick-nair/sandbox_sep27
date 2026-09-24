import { useEffect, useMemo, useRef, useState } from 'react';
import { INDUSTRIES, LOCATIONS, DEPTHS } from '../templates/ilead/context-packs.js';
import { AREAS, suggestProfile, industryPack, locationPack, GENIE_SCOPES, genieItems, geniePrompt, genieProposals } from '../templates/ilead/contextualize.js';
import { contextBoundItems } from '../engine/text.js';
import { Button, Callout, Field, Pill, Seg, TextInput, TokenText } from './ui.jsx';

// ---------- Layer 1: the organization profile ----------

export function ProfileForm({ profile, onChange }) {
  const [touched, setTouched] = useState({});
  const loc = locationPack(profile);
  const set = (key, value) => {
    setTouched((t) => ({ ...t, [key]: true }));
    onChange({ ...profile, [key]: value });
  };
  // Changing industry, what is sold or the country re-suggests the fields that follow from it,
  // unless the author typed them in this session.
  const setDriver = (key, value) => {
    const next = suggestProfile({ ...profile, [key]: value }, key, profile);
    for (const k of Object.keys(touched)) if (k !== key && touched[k]) next[k] = profile[k];
    onChange(next);
  };
  const industryOptions = [...Object.entries(INDUSTRIES).map(([id, p]) => [id, p.label]), ['other', 'Other (describe it)']];

  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="grid cols-2">
        <Field label="Industry" id="pf-industry">
          <select id="pf-industry" className="select" value={profile.industry} onChange={(e) => setDriver('industry', e.target.value)}>
            {industryOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        {profile.industry === 'other' ? (
          <TextInput label="Your industry" placeholder="e.g. Renewable energy" value={profile.customIndustry} onChange={(v) => set('customIndustry', v)} />
        ) : (
          <TextInput label="Organization name" value={profile.orgName} onChange={(v) => set('orgName', v)} />
        )}
      </div>
      {profile.industry === 'other' && <TextInput label="Organization name" value={profile.orgName} onChange={(v) => set('orgName', v)} />}

      <div className="grid cols-2">
        <Field label="What does the team sell?" id="pf-off">
          <Seg value={profile.offeringType} onChange={(v) => setDriver('offeringType', v)} options={[{ value: 'product', label: 'A product' }, { value: 'service', label: 'A service' }]} label="What the team sells" />
        </Field>
        <Field label="Who buys it?" id="pf-cust">
          <Seg value={profile.customerType} onChange={(v) => set('customerType', v)} options={[{ value: 'b2b', label: 'Businesses' }, { value: 'b2c', label: 'Consumers' }]} label="Who buys it" />
        </Field>
      </div>
      <div className="grid cols-2">
        <TextInput label={profile.offeringType === 'service' ? 'Service name' : 'Product name'} value={profile.offeringName} onChange={(v) => set('offeringName', v)} />
        <TextInput label="It is a..." hint="A common noun, used in events: home loan, cardiac monitor, managed IT service." value={profile.offeringCategory} onChange={(v) => set('offeringCategory', v)} />
      </div>
      <div className="grid cols-2">
        <Field label="Country" id="pf-country">
          <select id="pf-country" className="select" value={profile.country} onChange={(e) => setDriver('country', e.target.value)}>
            {Object.entries(LOCATIONS).map(([id, l]) => <option key={id} value={id}>{l.label}</option>)}
          </select>
        </Field>
        <Field label="City" id="pf-city" hint="Events and the team's world are set here.">
          <input id="pf-city" className="input" list="pf-cities" value={profile.city} onChange={(e) => set('city', e.target.value)} />
          <datalist id="pf-cities">{loc.cities.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <TextInput label="Learner's role in the story" value={profile.learnerRole} onChange={(v) => set('learnerRole', v)} hint={`Suggested for ${industryPack(profile).label.toLowerCase()}: ${industryPack(profile).learnerRole[profile.offeringType]}`} />
    </div>
  );
}

export function DepthPicker({ value, onChange, compact }) {
  if (compact) {
    return (
      <div className="stack" style={{ '--gap': '6px' }}>
        <Seg value={value} onChange={onChange} options={Object.entries(DEPTHS).map(([id, d]) => ({ value: id, label: d.label }))} label="How deep" />
        <span className="small muted">{DEPTHS[value]?.note}</span>
      </div>
    );
  }
  return (
    <div className="grid cols-3">
      {Object.entries(DEPTHS).map(([id, d]) => {
        const on = value === id;
        return (
          <button key={id} type="button" className="card" aria-pressed={on} onClick={() => onChange(id)} style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined }}>
            <h3>{d.label}</h3>
            <p className="small muted">{d.note}</p>
          </button>
        );
      })}
    </div>
  );
}

export function profileSummary(profile) {
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  return `${profile.orgName} · ${pack.label} · ${profile.offeringType === 'service' ? 'service' : 'product'} for ${profile.customerType === 'b2c' ? 'consumers' : 'businesses'} · ${profile.city ? `${profile.city}, ` : ''}${loc.label}`;
}

// ---------- Layer 2: review of what the profile changes ----------

const isShort = (p) => typeof p.after === 'number' || String(p.after).length < 70;

// selection: Set of excluded ids. edits: { id: value }.
export function ProposalReview({ def, proposals, excluded, setExcluded, edits = {}, setEdits, openFirst = true }) {
  const [editing, setEditing] = useState(null);
  const areas = useMemo(() => {
    const m = new Map();
    for (const p of proposals) {
      if (!m.has(p.area)) m.set(p.area, []);
      m.get(p.area).push(p);
    }
    return [...m.entries()];
  }, [proposals]);
  const included = proposals.filter((p) => !excluded.has(p.id)).length;
  const toggle = (id) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleArea = (items, on) => setExcluded((s) => { const n = new Set(s); items.forEach((p) => (on ? n.delete(p.id) : n.add(p.id))); return n; });

  if (!proposals.length) return <Callout tone="good" icon="✓">Everything already matches this profile. Nothing to change.</Callout>;

  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <span className="ink2"><strong className="num">{included}</strong> of <span className="num">{proposals.length}</span> changes ticked across {areas.length} area{areas.length === 1 ? '' : 's'}.</span>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set())}>Tick all</Button>
          <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set(proposals.map((p) => p.id)))}>Untick all</Button>
        </div>
      </div>
      {areas.map(([area, items], ai) => {
        const on = items.filter((p) => !excluded.has(p.id)).length;
        const reasons = [...new Set(items.flatMap((p) => p.because))];
        return (
          <details key={area} className="card" open={openFirst && ai < 2}>
            <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
              <div className="row spread">
                <div className="row nowrap">
                  <input type="checkbox" aria-label={`Include ${AREAS[area].label}`} checked={on === items.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < items.length; }} onChange={(e) => toggleArea(items, e.target.checked)} onClick={(e) => e.stopPropagation()} />
                  <strong>{AREAS[area].label}</strong>
                  <span className="small muted num">{on} of {items.length}</span>
                </div>
                <div className="row" style={{ '--gap': '4px' }}>{reasons.slice(0, 4).map((r) => <Pill key={r} tone="accent">{r}</Pill>)}</div>
              </div>
            </summary>
            <div className="stack" style={{ '--gap': '0', marginTop: 10 }}>
              {items.map((p) => {
                const after = edits[p.id] ?? p.after;
                const short = isShort(p);
                return (
                  <div key={p.id} className="grid" style={{ gridTemplateColumns: 'auto 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)', alignItems: 'start' }}>
                    <input type="checkbox" checked={!excluded.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Include ${p.label}`} style={{ marginTop: 3 }} />
                    <div className="stack" style={{ '--gap': '6px', minWidth: 0, opacity: excluded.has(p.id) ? 0.55 : 1 }}>
                      <div className="row spread">
                        <strong className="small">{p.label}</strong>
                        <div className="row" style={{ '--gap': '4px' }}>
                          {p.status === 'edited' && <Pill tone="warn">You changed this</Pill>}
                          {p.status === 'check' && <Pill tone="warn">{p.note || 'Check fields'}</Pill>}
                          <span className="small muted">because {p.because.join(', ')}</span>
                        </div>
                      </div>
                      {short ? (
                        <div className="row small" style={{ '--gap': '6px' }}>
                          <span className="muted" style={{ textDecoration: 'line-through' }}>{String(p.before) || 'empty'}</span>
                          <span className="muted">→</span>
                          {setEdits && editing === p.id ? (
                            <input className="input" style={{ maxWidth: 320 }} autoFocus value={after} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: typeof p.after === 'number' ? Number(e.target.value) || 0 : e.target.value }))} onBlur={() => setEditing(null)} aria-label={`Edit ${p.label}`} />
                          ) : (
                            <strong>{typeof after === 'number' ? after.toLocaleString() : after}</strong>
                          )}
                          {setEdits && editing !== p.id && <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>Edit</Button>}
                        </div>
                      ) : (
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                          <div className="small muted" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 8 }}><span className="eyebrow">Now</span><div><TokenText def={def} text={p.before} /></div></div>
                          <div className="small" style={{ background: 'var(--accent-soft)', borderRadius: 8, padding: 8 }}>
                            <div className="row spread"><span className="eyebrow">Proposed</span>{setEdits && <Button size="sm" variant="ghost" onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? 'Done' : 'Edit'}</Button>}</div>
                            {setEdits && editing === p.id ? (
                              <textarea className="textarea" rows={5} value={after} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: e.target.value }))} aria-label={`Edit ${p.label}`} />
                            ) : (
                              <div><TokenText def={def} text={after} /></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function chosen(proposals, excluded, edits = {}) {
  return proposals.filter((p) => !excluded.has(p.id)).map((p) => (edits[p.id] !== undefined ? { ...p, after: edits[p.id] } : p));
}

export function defaultExcluded(proposals) {
  return new Set(proposals.filter((p) => p.status === 'edited' || p.status === 'check').map((p) => p.id));
}

// ---------- Genie: hosted AI for anything the packs do not cover ----------

function useSample() {
  const [sample, setSample] = useState(undefined);
  useEffect(() => {
    let live = true;
    const c = typeof window !== 'undefined' ? window.claude : undefined;
    if (!c?.use) { setSample(null); return undefined; }
    // The capability is a function; wrap it so React stores it instead of calling it as an updater.
    c.use('sample').then((s) => live && setSample(() => s || null)).catch(() => live && setSample(null));
    return () => { live = false; };
  }, []);
  return sample;
}

const GENIE_ERRORS = {
  not_granted: 'Genie was not allowed for this page, so it is switched off for now.',
  sampling_disabled: 'Genie is not available for this account.',
  rate_limited: 'Genie is busy. Try again in a minute.',
  invalid_json: 'Genie\'s answer could not be read. Try again, or ask for fewer items.',
  refused: 'Genie declined this request. Change the notes and try again.',
  prompt_too_large: 'Too much text in one go. Pick a smaller scope.',
  empty_completion: 'Genie returned nothing. Try a smaller scope.',
  session_expired: 'Sign in again to use Genie.',
};
const HIDE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export function GeniePanel({ def, profile, onApply, defaultScope = 'flagged' }) {
  const sample = useSample();
  const [scope, setScope] = useState(defaultScope);
  useEffect(() => setScope(defaultScope), [defaultScope]);
  const [note, setNote] = useState('');
  const [state, setState] = useState({ phase: 'idle' });
  const [excluded, setExcluded] = useState(new Set());
  const [edits, setEdits] = useState({});
  const ctl = useRef(null);
  const flagged = useMemo(() => (def.context.industry.toLowerCase() !== def.context.originalIndustry.toLowerCase() ? contextBoundItems(def) : []), [def]);
  const items = useMemo(() => genieItems(def, scope, flagged), [def, scope, flagged]);

  const ask = async () => {
    ctl.current = new AbortController();
    setState({ phase: 'thinking' });
    try {
      const reply = await sample.json(geniePrompt(def, profile, items, note), { signal: ctl.current.signal });
      const props = genieProposals(def, items, reply);
      setExcluded(defaultExcluded(props));
      setEdits({});
      setState({ phase: 'done', proposals: props });
    } catch (e) {
      if (e?.code === 'cancelled') return setState({ phase: 'idle' });
      setState({ phase: HIDE.has(e?.code) ? 'off' : 'error', message: GENIE_ERRORS[e?.code] || 'Genie could not finish. Try again.' });
    }
  };

  return (
    <div className="card stack">
      <div className="row spread">
        <div className="row"><h3>Go further with Genie</h3><Pill tone="warmth">AI</Pill></div>
        <span className="small muted">Rewrites text the packs cannot cover: any industry, niche or house style.</span>
      </div>
      {sample === undefined && <p className="small muted">Checking whether Genie is available…</p>}
      {(sample === null || state.phase === 'off') && (
        <Callout>
          {state.phase === 'off' ? state.message : 'Genie rewriting runs when this studio is opened inside GenieKreator on claude.ai. Here, the packs above cover 8 industries and 8 countries, and anything left over is listed in the rewrite list.'}
        </Callout>
      )}
      {sample && state.phase !== 'off' && (
        <>
          <div className="grid cols-2">
            <Field label="What to rewrite" id="g-scope">
              <select id="g-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                {Object.entries(GENIE_SCOPES).map(([k, v]) => <option key={k} value={k}>{v} ({genieItems(def, k, flagged).length})</option>)}
              </select>
            </Field>
            <Field label="Anything Genie should know" id="g-note" hint="Optional. For example: our reps sell to hospitals in smaller cities; keep the tone formal.">
              <textarea id="g-note" className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="row">
            {state.phase === 'thinking' ? (
              <>
                <span className="small">Thinking… Genie is rewriting {items.length} items for {profile.orgName}.</span>
                <Button size="sm" onClick={() => ctl.current?.abort()}>Stop</Button>
              </>
            ) : (
              <Button variant="primary" disabled={!items.length} onClick={ask}>{items.length ? `Ask Genie to rewrite ${items.length} item${items.length === 1 ? '' : 's'}` : 'Nothing to rewrite in this scope'}</Button>
            )}
            <span className="small muted">Uses your Claude usage. You review every change before it applies.</span>
          </div>
          {state.phase === 'error' && <Callout tone="bad" icon="!">{state.message}</Callout>}
          {state.phase === 'done' && (
            <div className="stack">
              <ProposalReview def={def} proposals={state.proposals} excluded={excluded} setExcluded={setExcluded} edits={edits} setEdits={setEdits} />
              {state.proposals.length > 0 && (
                <div className="row">
                  <Button variant="primary" onClick={() => { onApply(chosen(state.proposals, excluded, edits)); setState({ phase: 'idle' }); }}>Apply {chosen(state.proposals, excluded, edits).length} Genie changes</Button>
                  <Button onClick={() => setState({ phase: 'idle' })}>Discard</Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
