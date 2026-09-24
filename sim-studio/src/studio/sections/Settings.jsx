import { useState } from 'react';
import { SESSION_LENGTHS, DIFFICULTY, rescaleTimeline, applyDifficulty } from '../../engine/authoring.js';
import { collectTexts } from '../../engine/text.js';
import { schemaProblems } from '../../engine/validate.js';
import { TEMPLATES } from '../../templates/registry.js';
import { Button, Callout, Field, NumberInput, Pill, SectionHead, Switch, copyText } from '../ui.jsx';

// Delivery options the runtime does not serve yet in this prototype. They are recorded on the
// definition so the choice travels with it, and labelled so no one expects them to work today.
const Planned = () => <Pill tone="warn" title="Recorded with the simulation; the runtime for this is not built in the prototype yet.">Planned</Pill>;

const LANGUAGES = { en: 'English', hi: 'Hindi', 'zh-Hans': 'Chinese (Simplified)', es: 'Spanish', fr: 'French', ja: 'Japanese', ar: 'Arabic', de: 'German' };

export default function Settings({ def, update, advanced, notify }) {
  const [lang, setLang] = useState('hi');
  const [json, setJson] = useState('');
  const [importError, setImportError] = useState('');
  const strings = collectTexts(def).filter((t) => t.text).length;
  const exportText = JSON.stringify(def, null, 2);

  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <SectionHead eyebrow="Ship" title="Settings and delivery">
        Length, difficulty, how learners get the simulation, and languages. Client-specific variants live here as settings, not as separate copies of the product.
      </SectionHead>

      <div className="card stack">
        <h3>Session length</h3>
        <div className="grid cols-3">
          {SESSION_LENGTHS.map((l) => {
            const on = def.timeline.weeks === l.weeks;
            return (
              <button key={l.id} type="button" className="card" aria-pressed={on} style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined }} onClick={() => { if (!on) { update(() => rescaleTimeline(def, l.weeks)); notify(`Calendar set to ${l.weeks} weeks`); } }}>
                <h3>{l.label}</h3>
                <p className="small muted">{l.note}</p>
              </button>
            );
          })}
        </div>
        <p className="small muted">Changing length moves every event and trigger check point proportionally and scales the target with the number of leads. Re-run the balance check afterwards.</p>
        {advanced && (
          <div className="row">
            <span className="advanced-tag">Engine</span>
            <Field label="Days per week" id="dpw" hint="Each action costs days, so fewer days means fewer actions per week."><NumberInput id="dpw" value={def.timeline.daysPerWeek} min={3} max={7} onChange={(v) => update((d) => { d.timeline.daysPerWeek = v; })} /></Field>
            <Field label="Maximum team size" id="max"><NumberInput id="max" value={def.team.maxSize} min={def.actors.filter((a) => a.pool === 'team').length} max={20} onChange={(v) => update((d) => { d.team.maxSize = v; })} /></Field>
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Difficulty</h3>
        <div className="grid cols-3">
          {Object.entries(DIFFICULTY).map(([id, d]) => {
            const on = def.meta.difficulty === id;
            return (
              <button key={id} type="button" className="card" aria-pressed={on} style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined }} onClick={() => update(() => applyDifficulty(def, id))}>
                <h3>{d.label}</h3>
                <p className="small muted">{d.note}</p>
              </button>
            );
          })}
        </div>
        {def.meta.difficulty === 'custom' && <p className="small muted">Custom: engine settings were changed by hand. Pick a preset to reset them.</p>}
      </div>

      <div className="card stack">
        <h3>Delivery</h3>
        <div className="grid cols-2">
          <Switch checked={def.delivery.individual} onChange={(v) => update((d) => { d.delivery.individual = v; })} label="Individual play" />
          <span className="row nowrap"><Switch checked={def.delivery.group} onChange={(v) => update((d) => { d.delivery.group = v; })} label="Group play with a group report" /><Planned /></span>
          <span className="row nowrap"><Switch checked={def.delivery.leaderboard} onChange={(v) => update((d) => { d.delivery.leaderboard = v; })} label="Leaderboard among peers" /><Planned /></span>
          <span className="row nowrap"><Switch checked={def.delivery.lti} onChange={(v) => update((d) => { d.delivery.lti = v; })} label="Launch from an LMS over LTI" /><Planned /></span>
          <span className="row nowrap"><Switch checked={def.delivery.scorm} onChange={(v) => update((d) => { d.delivery.scorm = v; })} label="SCORM package download" /><Planned /></span>
        </div>
        <p className="small muted">Individual play is what the prototype runs. Group play, leaderboards, LTI and SCORM are saved with the simulation for the production runtime.</p>
        <Callout>Legacy iLead ran separate code and databases for LTI, the Bajaj LTI org, Accenture, HR and the Chinese version. Here each of those is a setting or a variant of one simulation, served by one engine.</Callout>
      </div>

      <div className="card stack">
        <div className="row"><h3>Languages</h3><Planned /></div>
        <div className="stack" style={{ '--gap': '6px' }}>
          {def.delivery.languages.map((l) => (
            <div key={l} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{LANGUAGES[l] || l}</span>
              {l === 'en' ? <Pill tone="good">Source, {strings} strings</Pill> : (
                <div className="row">
                  <Pill tone="warn" title="Translation is planned: production drafts it with Genie for a reviewer to approve.">Not translated yet ({strings} strings)</Pill>
                  <Button size="sm" variant="ghost" className="danger" onClick={() => update((d) => { d.delivery.languages = d.delivery.languages.filter((x) => x !== l); })}>Remove</Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="row nowrap">
          <select className="select" style={{ maxWidth: 240 }} value={lang} aria-label="Language to add" onChange={(e) => setLang(e.target.value)}>
            {Object.entries(LANGUAGES).filter(([k]) => !def.delivery.languages.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <Button onClick={() => update((d) => { if (!d.delivery.languages.includes(lang)) d.delivery.languages.push(lang); })}>Add language</Button>
        </div>
        <p className="small muted">Every string is keyed, so a language is a translation layer over the same simulation. Production drafts translations with Genie for a reviewer to approve; the legacy language insertion script is retired.</p>
      </div>

      <div className="card stack">
        <h3>Your data</h3>
        <ul className="small ink2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>In this prototype, simulations are saved only in this browser. Anyone using this browser profile can open them, and clearing site data deletes them. Keep a copy of the definition below for anything that matters.</li>
          <li>When Genie is available, the text it reads or rewrites (your brief, your organization details and the items you regenerate) is sent to Claude under your account. Nothing is sent when Genie is not available.</li>
          <li>Your brief is kept with your draft for you only. It is not part of the definition, published versions or the exported file.</li>
        </ul>
        <p className="small muted">Production GenieKreator adds sign-in, separation between client organizations, an audit log, retention rules and a switch to turn Genie off for an organization.</p>
      </div>

      <div className="card stack">
        <h3>Definition file</h3>
        <p className="small ink2">The whole simulation as one JSON document: what the runtime plays and what engineering reviews. Copy it to hand over or to back up.</p>
        <div className="row">
          <Button onClick={async () => notify((await copyText(exportText)) ? 'Definition copied' : 'Copy blocked: select the text below instead')}>Copy definition</Button>
          <span className="small muted num">{(exportText.length / 1024).toFixed(0)} KB</span>
        </div>
        <textarea className="textarea mono" rows={6} readOnly value={exportText} aria-label="Definition JSON" onFocus={(e) => e.target.select()} />
        {advanced && (
          <div className="stack" style={{ '--gap': '6px' }}>
            <div className="row"><span className="advanced-tag">Engine</span><strong className="small">Replace from JSON</strong></div>
            <textarea className="textarea mono" rows={4} value={json} onChange={(e) => { setJson(e.target.value); setImportError(''); }} placeholder="Paste a definition" aria-label="Definition to import" />
            {importError && <Callout tone="bad" icon="!">{importError}</Callout>}
            <div><Button disabled={!json.trim()} onClick={() => {
              try {
                let parsed;
                try { parsed = JSON.parse(json); } catch (err) { throw new Error(`This is not valid JSON: ${err.message}`); }
                const problems = schemaProblems(parsed);
                if (problems.length) throw new Error(`This is not a complete simulation definition. ${problems.slice(0, 4).join(' ')}${problems.length > 4 ? ` And ${problems.length - 4} more.` : ''}`);
                const tpl = TEMPLATES[parsed.meta.templateId];
                if (!tpl) throw new Error(`This definition uses the template "${parsed.meta.templateId}", which this Studio does not have.`);
                const next = tpl.migrate(parsed);
                delete next.meta.brief;
                update(() => next);
                setJson('');
                notify('Definition replaced');
              } catch (e) {
                setImportError(e.message);
              }
            }}>Replace this simulation</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
