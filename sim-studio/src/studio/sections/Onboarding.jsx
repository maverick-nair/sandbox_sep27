// Learner onboarding: the briefing learners go through before the first decision. The author
// orders and switches chapters, writes their titles, lead lines and fact cards, adds chapters of
// their own, and sets how much the learner must explore before playing.
import { newId } from '../../engine/authoring.js';
import { renderText } from '../../engine/text.js';
import { CHAPTER_KINDS, defaultOnboarding, newChapter, OPENING, orderOpening } from '../../templates/ilead/onboarding.js';
import { Button, Callout, NumberInput, Pill, SectionHead, Switch, TextInput, TokenArea } from '../ui.jsx';

const SOURCE = {
  welcome: { text: "The CEO's welcome letter and portrait", section: 'story', label: 'Story and context (letter) and Look and feel (portrait)' },
  product: { text: 'The product brief and the product image', section: 'look', label: 'Look and feel' },
  targets: { text: 'The conversion target and value per conversion, and the duration and time limit', section: 'funnel', label: 'Funnel and target' },
  company: { text: 'The product brief', section: 'story', label: 'Story and context' },
  mission: { text: "The CEO's welcome letter and the target message", section: 'story', label: 'Story and context' },
  flow: { text: 'Stage names and descriptions', section: 'funnel', label: 'Funnel and target' },
  team: { text: 'Team members, their stages and backgrounds', section: 'team', label: 'Team' },
  model: { text: 'The four leadership styles', section: 'leadership', label: 'Leadership model' },
  howto: { text: 'Days per week, rethinks and the score weights', section: 'decisions', label: 'Decision moments' },
};

export default function Onboarding({ def, update, go, openPanel, notify }) {
  const ob = def.onboarding || defaultOnboarding();
  const set = (fn) => update((d) => { d.onboarding ||= defaultOnboarding(); fn(d.onboarding, d); });
  const chapters = ob.chapters || [];
  const on = chapters.filter((c) => c.enabled !== false);
  const teamSize = def.actors.filter((a) => a.pool === 'team').length;
  const move = (i, dir) => set((o) => { const j = i + dir; if (j < 0 || j >= o.chapters.length) return; [o.chapters[i], o.chapters[j]] = [o.chapters[j], o.chapters[i]]; orderOpening(o); });
  const opening = (c) => OPENING.includes(c.kind) || c.kind === 'mission';

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Learner onboarding" actions={<Button onClick={() => openPanel('preview')} tip="Opens the learner experience on its welcome screen, as a learner arrives." tipAlign="end">Preview onboarding</Button>}>
        What learners see before their first decision. Like the original iLead, every learner starts on three screens: Welcome (the CEO's letter), About the product and Your targets. Then the team, how to lead them and how the simulation works, and they accept the role. Nobody is asked to act before they know where they are.
      </SectionHead>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row spread">
          <h3>Briefing</h3>
          <Switch checked={ob.enabled !== false} onChange={(v) => set((o) => { o.enabled = v; })} label={ob.enabled !== false ? `On, ${on.length} part${on.length === 1 ? '' : 's'}` : 'Off'} />
        </div>
        {ob.enabled === false && <Callout tone="warn" icon="!">Learners go straight to accepting the role and their first Monday plan, without any context. Recommended only for a repeat run.</Callout>}
        <div className="row" style={{ '--gap': '16px' }}>
          <label className="row nowrap small" style={{ '--gap': '6px' }}>Team cards to turn over before continuing <NumberInput className="xs" value={ob.teamToMeet ?? 3} min={0} max={teamSize} onChange={(v) => set((o) => { o.teamToMeet = v; })} aria-label="Team cards to turn over" /> <span className="muted">of {teamSize}</span></label>
          <Switch checked={ob.practice !== false} onChange={(v) => set((o) => { o.practice = v; })} label="Practice round on the leadership styles (not scored)" />
          <Switch checked={ob.tour !== false} onChange={(v) => set((o) => { o.tour = v; })} label="Guided look at the workspace after the first plan" />
        </div>
      </div>

      <div className="stack" style={{ '--gap': '10px' }}>
        {chapters.map((c, i) => (
          <div key={c.id} className={`card stack chapter-card ${c.enabled === false ? 'off' : ''}`} style={{ '--gap': '10px' }}>
            <div className="row spread nowrap">
              <div className="row nowrap" style={{ '--gap': '10px', minWidth: 0 }}>
                <span className="badge num">{on.indexOf(c) >= 0 ? on.indexOf(c) + 1 : '–'}</span>
                <div style={{ minWidth: 0 }}>
                  <strong>{renderText(def, c.title) || 'Untitled chapter'}</strong>
                  <div className="small muted">{opening(c) ? <Pill tone="accent">Opening screen</Pill> : null} {CHAPTER_KINDS[c.kind]?.label} · {CHAPTER_KINDS[c.kind]?.note}{c.kind === 'company' ? ' The facts also show on the welcome screen, even when this chapter is off.' : ''}</div>
                </div>
              </div>
              <div className="row nowrap">
                <Button size="sm" variant="ghost" disabled={i === 0 || opening(c) || opening(chapters[i - 1] || {})} onClick={() => move(i, -1)} aria-label={`Move ${c.title} up`} title={opening(c) ? 'The three opening screens always come first, in this order.' : undefined}>↑</Button>
                <Button size="sm" variant="ghost" disabled={i === chapters.length - 1 || opening(c)} onClick={() => move(i, 1)} aria-label={`Move ${c.title} down`} title={opening(c) ? 'The three opening screens always come first, in this order.' : undefined}>↓</Button>
                <Switch checked={c.enabled !== false} onChange={(v) => set((o) => { o.chapters[i].enabled = v; })} label={<span className="sr-only">Show {c.title}</span>} />
              </div>
            </div>
            {(c.enabled !== false || c.kind === 'company') && (
              <div className="stack" style={{ '--gap': '10px' }}>
                <TextInput label="Title" value={c.title} onChange={(v) => set((o) => { o.chapters[i].title = v; })} hint="Context fields like {{company}} fill in for every tailoring." />
                <TokenArea def={def} label="Lead line" rows={2} value={c.lead} onChange={(v) => set((o) => { o.chapters[i].lead = v; })} hint="One or two sentences under the title." />
                {(c.kind === 'company' || c.kind === 'custom') && (
                  <TokenArea def={def} label={c.kind === 'custom' ? 'Text' : 'Text (leave empty to use the product brief)'} rows={5} value={c.body} onChange={(v) => set((o) => { o.chapters[i].body = v; })} />
                )}
                {c.kind === 'company' && (
                  <div className="stack" style={{ '--gap': '6px' }}>
                    <span className="small"><strong>Fact cards</strong> <span className="muted">Learners turn each one over to reveal it.</span></span>
                    {(c.facts || []).map((f, k) => (
                      <div key={k} className="fact-row">
                        <input className="input" value={f.label} onChange={(e) => set((o) => { o.chapters[i].facts[k].label = e.target.value; })} aria-label={`Fact ${k + 1} label`} placeholder="e.g. What we sell" />
                        <input className="input" value={f.value} onChange={(e) => set((o) => { o.chapters[i].facts[k].value = e.target.value; })} aria-label={`Fact ${k + 1}`} placeholder="e.g. {{product}}" />
                        <span className="small muted fact-preview">{renderText(def, f.value)}</span>
                        <Button size="sm" variant="ghost" onClick={() => set((o) => { o.chapters[i].facts.splice(k, 1); })} aria-label={`Remove fact ${k + 1}`}>Remove</Button>
                      </div>
                    ))}
                    {(c.facts || []).length < 6 && <div><Button size="sm" onClick={() => set((o) => { o.chapters[i].facts = [...(o.chapters[i].facts || []), { label: 'Our customers', value: '' }]; })}>Add fact card</Button></div>}
                  </div>
                )}
                {SOURCE[c.kind] && (
                  <p className="small muted">Content: {SOURCE[c.kind].text.charAt(0).toLowerCase() + SOURCE[c.kind].text.slice(1)}, edited in <button type="button" className="link-btn" onClick={() => go(SOURCE[c.kind].section)}>{SOURCE[c.kind].label}</button>, so this chapter stays in step with the rest of the simulation.</p>
                )}
                {c.kind === 'targets' && (
                  <div className="stack" style={{ '--gap': '6px' }}>
                    <span className="small"><strong>Targets learners see</strong> <span className="muted">Revenue and conversions come from the funnel; add the goals beyond the numbers.</span></span>
                    <ol className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Sales revenue: {def.funnel.currency} {(def.funnel.target * def.funnel.valuePerConversion).toLocaleString('en')}</li>
                      <li>{def.funnel.target} conversions (1 = {def.funnel.currency} {Number(def.funnel.valuePerConversion).toLocaleString('en')})</li>
                    </ol>
                    {(def.story.goals || []).map((g, k) => (
                      <div key={k} className="row nowrap">
                        <span className="badge num">{k + 3}</span>
                        <input className="input grow" value={g} onChange={(e) => update((d) => { d.story.goals[k] = e.target.value; })} aria-label={`Goal ${k + 3}`} />
                        <Button size="sm" variant="ghost" onClick={() => update((d) => { d.story.goals.splice(k, 1); })}>Remove</Button>
                      </div>
                    ))}
                    <div><Button size="sm" onClick={() => update((d) => { d.story.goals = [...(d.story.goals || []), 'Keep everyone on the team.']; })}>Add goal</Button></div>
                  </div>
                )}
                {c.kind === 'team' && (ob.teamToMeet ?? 3) > teamSize && <Callout tone="bad" icon="!">Learners must turn over {ob.teamToMeet} cards but the team has {teamSize} people.</Callout>}
                {c.kind === 'custom' && <div><Button size="sm" variant="ghost" className="danger" onClick={() => { set((o) => { o.chapters.splice(i, 1); }); notify('Chapter removed. Undo is at the top.'); }}>Remove chapter</Button></div>}
              </div>
            )}
          </div>
        ))}
        <div className="row">
          <Button onClick={() => set((o) => { o.chapters.push(newChapter(newId('chapter'))); })}>Add your own chapter</Button>
          {!chapters.some((c) => c.kind === 'flow') && <Button variant="ghost" onClick={() => set((o) => { const at = o.chapters.findIndex((c) => c.kind === 'team'); o.chapters.splice(at >= 0 ? at : o.chapters.length, 0, { id: 'flow', kind: 'flow', enabled: true, title: 'How the work flows', lead: 'Every sale passes through your team, stage by stage. Conversions come out of the last stage, so a stage that gets stuck starves every stage after it.' }); })}>Add "How the work flows"</Button>}
          {chapters.length < defaultOnboarding().chapters.length && <Button variant="ghost" onClick={() => set((o) => { const have = new Set(o.chapters.map((c) => c.kind)); for (const c of defaultOnboarding().chapters) if (!have.has(c.kind)) o.chapters.push(c); })}>Restore standard chapters</Button>}
        </div>
      </div>
      <p className="small muted">After the briefing, learners accept the role (name, cohort code, group) and start week 1 with "How will you read each person this week?"</p>
    </div>
  );
}

