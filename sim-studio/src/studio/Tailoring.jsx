import { useEffect, useMemo, useRef, useState } from 'react';
import { INDUSTRIES, DEPTHS } from '../templates/ilead/context-packs.js';
import { COUNTRIES, COUNTRY_LIST, CURRENCIES, REGIONS, findCountry } from '../templates/ilead/world.js';
import { AREAS, applyProposals, suggestProfile, industryPack, locationPack, GENIE_SCOPES, genieItems, geniePrompt, genieProposals } from '../templates/ilead/contextualize.js';
import { contextBoundItems, renderText } from '../engine/text.js';
import { Button, Callout, Combobox, Field, Pill, Seg, TextInput, TokenText } from './ui.jsx';
import { clone } from '../engine/clone.js';

// ---------- Layer 1: the organization profile ----------

export function ProfileForm({ profile, onChange }) {
  const [touched, setTouched] = useState({});
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
      <LocationFields profile={profile} onChange={onChange} setDriver={setDriver} markTouched={(k) => setTouched((t) => ({ ...t, [k]: true }))} />
      <TextInput label="Learner's role in the story" value={profile.learnerRole} onChange={(v) => set('learnerRole', v)} hint={`Suggested for ${industryPack(profile).label.toLowerCase()}: ${industryPack(profile).learnerRole[profile.offeringType]}`} />
    </div>
  );
}

// Country: any country in the list, or one the author invents. City: the country's largest
// cities as one-click choices, or any city typed in, real or fictitious.
export function LocationFields({ profile, onChange, setDriver, markTouched = () => {} }) {
  const loc = locationPack(profile);
  const nameOf = (p) => (p.country === 'custom' ? p.customCountry || '' : COUNTRIES[p.country]?.name || '');
  const [countryText, setCountryText] = useState(nameOf(profile));
  useEffect(() => setCountryText(nameOf(profile)), [profile.country, profile.customCountry]); // eslint-disable-line react-hooks/exhaustive-deps
  const listed = loc.cities.includes(profile.city);

  const typeCountry = (text) => {
    setCountryText(text);
    const code = findCountry(text);
    if (code && code !== profile.country) setDriver('country', code);
  };
  const commitCountry = () => {
    const text = countryText.trim();
    if (!text) return setCountryText(nameOf(profile));
    if (findCountry(text)) return undefined;
    // Not in the list: keep it as the author's own country, borrowing style and currency from the last one.
    const prevRegion = profile.country === 'custom' ? profile.customRegion : COUNTRIES[profile.country]?.region;
    const prevCurrency = profile.country === 'custom' ? profile.customCurrency : COUNTRIES[profile.country]?.currency;
    onChange({ ...profile, country: 'custom', customCountry: text, customRegion: prevRegion || 'anglo', customCurrency: prevCurrency || 'USD', city: listed ? '' : profile.city });
    return undefined;
  };
  // A chosen chip follows the country when it changes; a typed city is the author's and stays.
  const setCity = (city, typed) => { if (typed) markTouched('city'); onChange({ ...profile, city }); };

  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <Field label="Country" id="pf-country" hint={profile.country === 'custom' ? '' : 'Start typing to search any country. Type a name that is not in the list to use a fictitious country.'}>
        <Combobox
          id="pf-country"
          value={countryText}
          options={COUNTRY_LIST.map((c) => c.name)}
          onChange={typeCountry}
          onCommit={commitCountry}
          label="Country"
        />
      </Field>

      {profile.country === 'custom' ? (
        <div className="card flat stack" style={{ '--gap': '10px' }}>
          <div className="row"><Pill tone="warmth">Your own country</Pill><span className="small ink2">{profile.customCountry} is not a real country in our list, so tell us how it should feel.</span></div>
          <div className="grid cols-2">
            <Field label="Names and places in the style of" id="pf-region">
              <select id="pf-region" className="select" value={profile.customRegion} onChange={(e) => onChange({ ...profile, customRegion: e.target.value })}>
                {Object.entries(REGIONS).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Currency" id="pf-currency">
              <select id="pf-currency" className="select" value={profile.customCurrency} onChange={(e) => onChange({ ...profile, customCurrency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: -8 }}>Currency {loc.currency} · {loc.namesFrom === 'country' ? `team names from ${loc.label}` : `team names in ${REGIONS[loc.region]?.label.toLowerCase()} style; review them on the People step`}</p>
      )}

      <div className="field">
        <span className="label">City</span>
        {loc.cities.length > 0 && (
          <div className="row" role="radiogroup" aria-label={`Largest cities in ${loc.label}`} style={{ '--gap': '6px' }}>
            {loc.cities.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={profile.city === c} className={`btn sm ${profile.city === c ? 'primary' : ''}`} onClick={() => setCity(c, false)}>{c}</button>
            ))}
          </div>
        )}
        <input
          id="pf-city"
          className="input"
          aria-label="Your own city"
          placeholder={loc.cities.length ? 'Or type your own city, real or fictitious' : `Type a city in ${loc.label}, real or fictitious`}
          value={listed ? '' : profile.city}
          onChange={(e) => setCity(e.target.value, true)}
        />
        <span className="hint">
          {loc.cities.length ? `The ${loc.cities.length} largest cities in ${loc.label}. ` : ''}
          {profile.city && !listed ? `Using "${profile.city}" exactly as typed in events and the team's world.` : 'Events and the team\'s world are set here.'}
        </span>
      </div>
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
  // Render every item against the draft as it will be, so names read as the final version.
  const finalDef = useMemo(() => applyProposals(clone(def), chosen(proposals, excluded, edits)), [def, proposals, excluded, edits]);
  const toggle = (id) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleArea = (items, on) => setExcluded((s) => { const n = new Set(s); items.forEach((p) => (on ? n.delete(p.id) : n.add(p.id))); return n; });

  if (!proposals.length) return <Callout tone="good" icon="✓">Everything already matches this profile. Nothing to change.</Callout>;

  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <span className="ink2"><strong className="num">{included}</strong> of <span className="num">{proposals.length}</span> tailored items included across {areas.length} area{areas.length === 1 ? '' : 's'}.</span>
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
                      {/* Only the tailored result is shown; no replacement history. */}
                      {setEdits && editing === p.id ? (
                        short ? (
                          <input className="input" style={{ maxWidth: 360 }} autoFocus value={after} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: typeof p.after === 'number' ? Number(e.target.value) || 0 : e.target.value }))} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} aria-label={`Edit ${p.label}`} />
                        ) : (
                          <div className="stack" style={{ '--gap': '6px' }}>
                            <textarea className="textarea" rows={5} autoFocus value={after} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: e.target.value }))} aria-label={`Edit ${p.label}`} />
                            <div><Button size="sm" onClick={() => setEditing(null)}>Done</Button></div>
                          </div>
                        )
                      ) : (
                        <div className="row nowrap" style={{ alignItems: 'flex-start' }}>
                          <div className={short ? 'grow' : 'grow small'} style={short ? { fontWeight: 600 } : { lineHeight: 1.55 }}>
                            {typeof after === 'number' ? after.toLocaleString() : <FinalText def={finalDef} text={after} />}
                          </div>
                          {setEdits && <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)} tip="Change this wording yourself">Edit</Button>}
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

// The finished sentence as learners will read it, with names filled in from the draft.
function FinalText({ def, text }) {
  return <span style={{ whiteSpace: 'pre-wrap' }}>{renderText(def, text, { actor: 'a team member', pronoun: 'they', stage: def.stages[0]?.name, style: def.leadership.styles[0]?.name })}</span>;
}

export function chosen(proposals, excluded, edits = {}) {
  return proposals.filter((p) => !excluded.has(p.id)).map((p) => (edits[p.id] !== undefined ? { ...p, after: edits[p.id] } : p));
}

export function defaultExcluded(proposals) {
  return new Set(proposals.filter((p) => p.status === 'edited' || p.status === 'check').map((p) => p.id));
}

// ---------- Genie: hosted AI for anything the packs do not cover ----------

export function useSample() {
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
