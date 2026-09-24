import { useMemo, useState } from 'react';
import { TEMPLATES, PLANNED_TEMPLATES } from '../templates/registry.js';
import { validate, healthSummary } from '../engine/validate.js';
import { Button, Pill, SectionHead } from './ui.jsx';

// The 4E product lines of GenieKreator. Only Experience > Simulations is built in this prototype.
export const PRODUCT_LINES = [
  { id: 'evaluate', name: 'Evaluate', items: ['Conversation AI', 'Nano AI', 'PitchPerfect AI'] },
  { id: 'educate', name: 'Educate', items: ['AI Microlearn', 'Interactive Learn'] },
  { id: 'experience', name: 'Experience', items: ['Simulations', 'AI RolePlay'] },
  { id: 'enable', name: 'Enable', items: ['AI Koach'] },
];

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString();
}

function HealthPill({ def }) {
  const h = healthSummary(validate(def));
  if (h.errors) return <Pill tone="bad">{h.errors} to fix</Pill>;
  if (h.warnings) return <Pill tone="warn">{h.warnings} to review</Pill>;
  return <Pill tone="good">Ready</Pill>;
}

export default function Home({ store, flowDraft, onResume, onDiscardDraft, onOpen, onNew, notify }) {
  const [confirm, setConfirm] = useState(null);
  const t = TEMPLATES.ilead;
  const sims = useMemo(() => [...store.sims].sort((a, b) => b.updatedAt - a.updatedAt), [store.sims]);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Product lines">
        {PRODUCT_LINES.map((line) => (
          <div className="rail-group" key={line.id}>
            <span className="eyebrow">{line.name}</span>
            {line.items.map((item) => {
              const active = item === 'Simulations';
              return (
                <button key={item} type="button" className={`rail-item ${active ? 'active' : ''}`} aria-disabled={!active} aria-current={active ? 'page' : undefined} title={active ? '' : 'Not part of this prototype'}>
                  {item}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <main className="main">
        <div className="page stack" style={{ '--gap': '28px' }}>
          <SectionHead eyebrow="Experience" title="Simulations">
            Build a simulation from a proven template, fit it to your client's world, check that it rewards the right behaviour, then publish.
          </SectionHead>

          {flowDraft && (
            <div className="card row spread" style={{ borderColor: 'var(--accent)' }}>
              <div className="stack" style={{ '--gap': '2px', minWidth: 0 }}>
                <span className="eyebrow">Resume where you left off</span>
                <strong>{flowDraft.profile?.orgName?.trim() ? `iLead for ${flowDraft.profile.orgName}` : 'A new iLead simulation'}</strong>
                <span className="small muted">Step {(flowDraft.step || 0) + 1} of 6 · saved {ago(flowDraft.at)}{flowDraft.brief?.instructions ? ` · "${flowDraft.brief.instructions.slice(0, 70)}${flowDraft.brief.instructions.length > 70 ? '…' : ''}"` : ''}</span>
              </div>
              <div className="row nowrap">
                {confirm === 'draft' ? (
                  <>
                    <span className="small">Discard this draft?</span>
                    <Button size="sm" onClick={() => setConfirm(null)}>Keep it</Button>
                    <Button size="sm" variant="danger" onClick={() => { onDiscardDraft(); setConfirm(null); }}>Discard</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm('draft')}>Discard</Button>
                    <Button variant="primary" onClick={onResume} tip="Opens the creation flow exactly where you left it." tipAlign="end">Resume</Button>
                  </>
                )}
              </div>
            </div>
          )}

          <section className="stack" aria-labelledby="tpl-h">
            <h2 id="tpl-h">Start from a template</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 0 }}>
                <div className="stack" style={{ padding: 20, '--gap': '12px' }}>
                  <div className="row"><Pill tone="accent">{t.family}</Pill><Pill>{t.duration}</Pill></div>
                  <h2 style={{ fontSize: 28 }}>{t.name}</h2>
                  <p className="ink2" style={{ maxWidth: '52ch' }}>{t.tagline}</p>
                  <div className="row" style={{ '--gap': '6px' }}>
                    {t.skills.map((s) => <Pill key={s}>{s}</Pill>)}
                  </div>
                  <p className="small muted">For {t.audiences.join(', ').toLowerCase()}.</p>
                  <div className="row" style={{ marginTop: 4 }}>
                    <Button variant="primary" size="lg" onClick={() => (flowDraft ? setConfirm('new') : onNew('ilead'))} tip={flowDraft ? 'Starts a new simulation. The draft you have in progress is replaced; use Resume above to continue it instead.' : 'Describe what you need in a few sentences. A tailored iLead simulation is drafted step by step for you to review.'} tipAlign="start">Use this template</Button>
                  </div>
                  {confirm === 'new' && (
                    <div className="callout warn">
                      <span className="ic">!</span>
                      <div className="grow stack" style={{ '--gap': '6px' }}>
                        <span>You have a simulation in progress. Starting a new one replaces it.</span>
                        <div className="row"><Button size="sm" variant="primary" onClick={() => { setConfirm(null); onResume(); }}>Resume it</Button><Button size="sm" onClick={() => { setConfirm(null); onNew('ilead'); }}>Start a new one</Button></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="stack" style={{ padding: 20, background: 'var(--surface-2)', '--gap': '8px' }}>
                  <span className="eyebrow">Storylines</span>
                  {t.storylines.map((s) => (
                    <div key={s.id} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <span>{s.name}</span>
                      {s.status === 'ready' ? <Pill tone="good">Ready</Pill> : <Pill title={s.note}>To migrate</Pill>}
                    </div>
                  ))}
                  <p className="small muted">Storylines marked "To migrate" existed in legacy iLead. Each needs its content workbook run through the migration script; the engine is shared.</p>
                </div>
              </div>
            </div>
            <div className="row small muted" style={{ '--gap': '6px' }}>
              <span>Next to become templates:</span>
              {PLANNED_TEMPLATES.map((p) => <Pill key={p.name} title={p.family}>{p.name}</Pill>)}
            </div>
          </section>

          <section className="stack" aria-labelledby="mine-h">
            <div className="row spread">
              <h2 id="mine-h">Your simulations</h2>
              <Button size="sm" variant="ghost" onClick={() => setConfirm('reset')} tip="Removes the simulations saved in this browser and restores the migrated iLead sample." tipAlign="end">Reset sample data</Button>
            </div>
            {confirm === 'reset' && (
              <div className="callout warn">
                <span className="ic">!</span>
                <div className="grow row spread">
                  <span>Remove every simulation in this browser and restore the migrated sample?</span>
                  <div className="row">
                    <Button size="sm" onClick={() => setConfirm(null)}>Keep them</Button>
                    <Button size="sm" variant="primary" onClick={() => { store.reset(); setConfirm(null); notify('Sample restored'); }}>Reset</Button>
                  </div>
                </div>
              </div>
            )}
            {sims.length === 0 ? (
              <div className="empty">No simulations yet. Start from the iLead template above.</div>
            ) : (
              <div className="card scroll-x" style={{ padding: 4 }}>
                <table className="table">
                  <thead>
                    <tr><th>Name</th><th>Template</th><th>Status</th><th>Health</th><th>Updated</th><th /></tr>
                  </thead>
                  <tbody>
                    {sims.map((s) => (
                      <tr key={s.id} className="clickable" onClick={() => onOpen(s.id)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{s.def.meta.name}</div>
                          <div className="small muted">{s.def.context.entities.find((e) => e.key === 'company')?.value} · {s.def.context.industry} · {s.def.timeline.weeks} weeks</div>
                        </td>
                        <td>{TEMPLATES[s.def.meta.templateId]?.name}</td>
                        <td>{s.status === 'published' ? <Pill tone="accent">Published v{s.versions.at(-1)?.version}</Pill> : <Pill>Draft</Pill>}</td>
                        <td><HealthPill def={s.def} /></td>
                        <td className="small muted num">{ago(s.updatedAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {confirm === s.id ? (
                            <div className="row nowrap">
                              <Button size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                              <Button size="sm" variant="danger" onClick={() => { store.remove(s.id); setConfirm(null); notify('Simulation deleted'); }}>Delete</Button>
                            </div>
                          ) : (
                            <div className="row nowrap">
                              <Button size="sm" onClick={() => onOpen(s.id)} tip="Open in the Studio to edit, test and publish.">Open</Button>
                              <Button size="sm" variant="ghost" onClick={() => { store.duplicate(s.id); notify('Copy created'); }} tip="Makes an independent draft copy, useful for a second client or language.">Duplicate</Button>
                              <Button size="sm" variant="ghost" className="danger" onClick={() => setConfirm(s.id)} tip="Deletes this simulation from this browser. You confirm first." tipAlign="end">Delete</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
