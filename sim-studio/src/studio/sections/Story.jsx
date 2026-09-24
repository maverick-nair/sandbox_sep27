import { useEffect, useMemo, useState } from 'react';
import { collectTexts, contextBoundItems } from '../../engine/text.js';
import { setTextAt } from '../../engine/authoring.js';
import { TEMPLATES } from '../../templates/registry.js';
import { AREAS } from '../../templates/ilead/contextualize.js';
import { Button, Callout, Pill, SectionHead, TextInput, TokenArea, TokenText } from '../ui.jsx';
import { ProfileForm, DepthPicker, ProposalReview, GeniePanel, chosen, defaultExcluded, profileSummary } from '../Tailoring.jsx';

// Profile changes not applied yet, per simulation, so they survive switching tabs and sections.
const pendingProfiles = new Map();

export default function Story({ def, update, focus, notify, sim }) {
  const simKey = sim?.id || def.meta.name;
  const [pending, setPendingState] = useState(() => pendingProfiles.get(simKey) || null);
  const setPending = (p) => {
    const same = !p || JSON.stringify(p) === JSON.stringify(def.context.profile);
    if (same) pendingProfiles.delete(simKey); else pendingProfiles.set(simKey, p);
    setPendingState(same ? null : p);
  };
  const industryChanged = def.context.industry.toLowerCase() !== def.context.originalIndustry.toLowerCase();
  const bound = contextBoundItems(def);
  const [tab, setTab] = useState(focus?.field === 'rewrite' || (industryChanged && bound.length) ? 'rewrite' : focus?.field === 'context' ? 'context' : 'profile');
  const tabs = [
    ['profile', `Your organization${pending ? ' (not applied yet)' : ''}`],
    ['context', 'Context fields'],
    ['rewrite', `Rewrite list${industryChanged && bound.length ? ` (${bound.length})` : ''}`],
    ['letters', 'Welcome and target'],
    ['briefing', 'Briefing script'],
    ['tour', 'Onboarding tour'],
  ];
  return (
    <div>
      <SectionHead eyebrow="Build" title="Story and context">
        Describe your organization and the simulation is tailored to it: names, money, stages, story, events and people. Fine-tune any name in Context fields; anything still tied to the original storyline is in the rewrite list.
      </SectionHead>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {pending && tab !== 'profile' && (
        <Callout tone="warn" icon="!">
          Your organization profile has changes that are not applied yet. <Button size="sm" onClick={() => setTab('profile')}>Review and apply</Button> <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Discard them</Button>
        </Callout>
      )}
      {tab === 'profile' && <OrgProfile def={def} update={update} notify={notify} pending={pending} setPending={setPending} />}
      {tab === 'context' && <ContextFields def={def} update={update} />}
      {tab === 'rewrite' && (
        <div className="stack" style={{ '--gap': '18px' }}>
          <RewriteList def={def} update={update} bound={bound} industryChanged={industryChanged} />
          {industryChanged && bound.length > 0 && <GeniePanel def={def} profile={def.context.profile} onApply={(props) => { update((d) => TEMPLATES[d.meta.templateId].contextualize.applyProposals(d, props)); notify?.(`${props.length} changes applied`); }} />}
        </div>
      )}
      {tab === 'letters' && (
        <div className="stack" style={{ '--gap': '18px', maxWidth: 820 }}>
          <TokenArea def={def} label="Welcome letter" rows={9} value={def.story.welcome} onChange={(v) => update((d) => { d.story.welcome = v; })} hint="The first thing learners read. Signed by the letter signatory." />
          <TokenArea def={def} label="Product brief" rows={6} value={def.story.overview} onChange={(v) => update((d) => { d.story.overview = v; })} />
          <TokenArea def={def} label="Target message" rows={2} value={def.story.target} onChange={(v) => update((d) => { d.story.target = v; })} />
        </div>
      )}
      {tab === 'briefing' && (
        <div className="stack" style={{ maxWidth: 820 }}>
          <p className="small ink2">Script for the introductory video on the four leadership styles. It is shared by every storyline.</p>
          {def.story.briefing.map((p, i) => (
            <TokenArea key={i} def={def} label={`Paragraph ${i + 1}`} rows={2} preview={false} value={p} onChange={(v) => update((d) => { d.story.briefing[i] = v; })} />
          ))}
        </div>
      )}
      {tab === 'tour' && <Tour def={def} update={update} />}
    </div>
  );
}

function ContextFields({ def, update }) {
  const [term, setTerm] = useState('');
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start', gap: 20 }}>
      <div className="card stack">
        <h3>Names and roles</h3>
        <TextInput label="Industry" value={def.context.industry} onChange={(v) => update((d) => { d.context.industry = v; })} hint={`The template was written for ${def.context.originalIndustry}. Changing it switches on the rewrite list.`} />
        {def.context.entities.map((e) => (
          <div key={e.key} className="grid" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end', gap: 8 }}>
            <TextInput label={e.label} hint={e.hint} value={e.value} onChange={(v) => update((d) => { d.context.entities.find((x) => x.key === e.key).value = v; })} />
            <span className="token" title="Field used in the text" style={{ marginBottom: 22 }}>{`{{${e.key}}}`}</span>
          </div>
        ))}
      </div>
      <div className="stack">
        <div className="card stack">
          <h3>Situation words</h3>
          <p className="small ink2">Words that describe the original world. Any text that uses them goes on the rewrite list when the industry changes.</p>
          <div className="row">
            {def.context.boundTerms.map((t) => (
              <span key={t} className="pill warn">
                {t}
                <button type="button" className="btn ghost sm" style={{ padding: '0 2px', minWidth: 0 }} aria-label={`Remove ${t}`} onClick={() => update((d) => { d.context.boundTerms = d.context.boundTerms.filter((x) => x !== t); })}>×</button>
              </span>
            ))}
          </div>
          <form className="row nowrap" onSubmit={(e) => { e.preventDefault(); if (term.trim()) update((d) => { d.context.boundTerms = [...new Set([...d.context.boundTerms, term.trim()])]; }); setTerm(''); }}>
            <input className="input" placeholder="Add a word, e.g. escalator" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Add situation word" />
            <Button type="submit">Add</Button>
          </form>
        </div>
        <Callout tone="accent">
          In production, "Rewrite with Genie" drafts each flagged item for the new industry using the context above, for the author to accept or edit. This prototype lists the items and lets you rewrite them in place.
        </Callout>
      </div>
    </div>
  );
}

function RewriteList({ def, update, bound: flagged, industryChanged }) {
  const [open, setOpen] = useState(null);
  // Keep the item being edited on screen even after its last situation word is gone.
  const keyOf = (b) => `${b.label}-${JSON.stringify(b.ref)}`;
  const editing = open && !flagged.some((b) => keyOf(b) === open) ? collectTexts(def).filter((t) => keyOf(t) === open).map((t) => ({ ...t, terms: [] })) : [];
  const bound = [...flagged, ...editing];
  if (!industryChanged) {
    return <Callout>The industry is still {def.context.originalIndustry}, so nothing needs rewriting. Change the industry in Context fields to see which situations are tied to it ({bound.length} items today).</Callout>;
  }
  if (!bound.length) return <Callout tone="good" icon="✓">Nothing left to rewrite. Every situation now fits {def.context.industry}.</Callout>;
  const bySection = bound.reduce((acc, b) => ((acc[b.section] = acc[b.section] || []).push(b), acc), {});
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <Callout tone="warn" icon="!">These {flagged.length} items describe situations from the original {def.context.originalIndustry.toLowerCase()} storyline (words found: {[...new Set(flagged.flatMap((b) => b.terms))].join(', ')}). An item leaves the list once its text no longer uses a situation word.</Callout>
      {Object.entries(bySection).map(([section, items]) => (
        <div key={section} className="stack" style={{ '--gap': '8px' }}>
          <h3 style={{ textTransform: 'capitalize' }}>{section} <Pill>{items.length}</Pill></h3>
          {items.map((b) => {
            const key = keyOf(b);
            return (
              <div key={key} className="card tight stack" style={{ '--gap': '8px' }}>
                <div className="row spread nowrap">
                  <strong className="small">{b.label}</strong>
                  <Button size="sm" onClick={() => setOpen(open === key ? null : key)}>{open === key ? 'Done' : 'Rewrite'}</Button>
                </div>
                {open === key ? (
                  <TokenArea def={def} value={b.text} rows={4} tokens="actor" onChange={(v) => update((d) => setTextAt(d, b.ref, v))} />
                ) : (
                  <p className="small ink2"><TokenText def={def} text={b.text} highlight={b.terms} /></p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Tour({ def, update }) {
  const move = (i, dir) => update((d) => {
    const w = d.story.walkthrough;
    const j = i + dir;
    if (j < 0 || j >= w.length) return;
    [w[i], w[j]] = [w[j], w[i]];
  });
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <p className="small ink2">Coach marks shown the first time a learner opens each screen, in this order.</p>
      {def.story.walkthrough.map((w, i) => (
        <div key={i} className="card tight grid" style={{ gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'start' }}>
          <span className="badge num" style={{ marginTop: 6 }}>{i + 1}</span>
          <div className="stack" style={{ '--gap': '6px' }}>
            <input className="input" aria-label={`Step ${i + 1} title`} value={w.title} onChange={(e) => update((d) => { d.story.walkthrough[i].title = e.target.value; })} />
            <textarea className="textarea" rows={2} aria-label={`Step ${i + 1} text`} value={w.text} onChange={(e) => update((d) => { d.story.walkthrough[i].text = e.target.value; })} />
          </div>
          <div className="stack" style={{ '--gap': '4px' }}>
            <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">Up</Button>
            <Button size="sm" variant="ghost" disabled={i === def.story.walkthrough.length - 1} onClick={() => move(i, 1)} aria-label="Move down">Down</Button>
            <Button size="sm" variant="ghost" className="danger" onClick={() => update((d) => { d.story.walkthrough.splice(i, 1); })}>Remove</Button>
          </div>
        </div>
      ))}
      <div><Button onClick={() => update((d) => { d.story.walkthrough.push({ title: 'New step', text: '' }); })}>Add step</Button></div>
    </div>
  );
}

// Layer 1 (the profile) and layer 2 (what it changes), editable at any time after creation.
function OrgProfile({ def, update, notify, pending, setPending }) {
  const ctx = TEMPLATES[def.meta.templateId].contextualize;
  const profile = pending || def.context.profile;
  const setProfile = (p) => setPending(p);
  const proposals = useMemo(() => ctx.proposeContext(def, profile), [ctx, def, profile]);
  const [excluded, setExcluded] = useState(() => defaultExcluded(proposals));
  const [edits, setEdits] = useState({});
  useEffect(() => {
    // New proposals start ticked unless they would overwrite the author's own edits.
    setExcluded((prev) => {
      const ids = new Set(proposals.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      for (const p of proposals) if (p.status !== 'new' && !prev.has(p.id)) next.add(p.id);
      return next;
    });
  }, [proposals]);
  const picked = chosen(proposals, excluded, edits);
  const profileChanged = JSON.stringify(profile) !== JSON.stringify(def.context.profile);
  const counts = proposals.reduce((m, p) => ((m[p.area] = (m[p.area] || 0) + 1), m), {});
  const apply = () => {
    update((d) => ctx.applyProposals(d, picked, profile));
    setEdits({});
    setPending(null);
    notify?.(picked.length ? `${picked.length} changes applied` : 'Profile saved');
  };

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      {profileChanged && (
        <Callout tone="warn" icon="!">
          <strong>Not applied yet.</strong> The simulation does not change until you apply. Your edits here are kept if you switch tabs.
        </Callout>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start', gap: 20 }}>
        <div className="card stack">
          <h3>Organization profile</h3>
          <ProfileForm profile={profile} onChange={(p) => { setProfile(p); setEdits({}); }} />
        </div>
        <div className="stack" style={{ position: 'sticky', top: 16 }}>
          <div className="card stack">
            <span className="eyebrow">Tailored for</span>
            <strong>{profileSummary(profile)}</strong>
            <span className="label small" style={{ fontWeight: 600 }}>How deep</span>
            <DepthPicker compact value={profile.depth} onChange={(d) => setProfile({ ...profile, depth: d })} />
            {proposals.length ? (
              <div className="stack" style={{ '--gap': '4px' }}>
                {Object.entries(counts).map(([a, n]) => <div key={a} className="row spread small"><span>{AREAS[a].label}</span><span className="num">{n}</span></div>)}
              </div>
            ) : <p className="small muted">The simulation already matches this profile.</p>}
            <div className="row">
              <Button variant="primary" disabled={!picked.length && !profileChanged} onClick={apply}>{picked.length ? `Apply ${picked.length} change${picked.length === 1 ? '' : 's'}` : 'Save profile'}</Button>
              {profileChanged && <Button variant="ghost" onClick={() => setPending(null)}>Discard changes</Button>}
            </div>
            <p className="small muted">Changes you made by hand since the last tailoring are marked and left unticked.</p>
          </div>
        </div>
      </div>
      {proposals.length > 0 && (
        <section className="stack">
          <h2>What changes</h2>
          <ProposalReview def={def} proposals={proposals} excluded={excluded} setExcluded={setExcluded} edits={edits} setEdits={setEdits} openFirst={false} />
        </section>
      )}
      {def.context.profile.industry === 'other' && (
        <Callout tone="warn" icon="!">{def.context.profile.customIndustry || 'Your industry'} is not one of the built-in industry packs, so events, stages and the product brief use generic versions. Ask Genie to write versions specific to your industry.</Callout>
      )}
      <GeniePanel def={def} profile={def.context.profile} defaultScope={def.context.profile.industry === 'other' ? 'story' : 'flagged'} onApply={(props) => { update((d) => ctx.applyProposals(d, props)); notify?.(`${props.length} Genie changes applied`); }} />
    </div>
  );
}
