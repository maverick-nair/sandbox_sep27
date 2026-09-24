// Delivery settings: how learners get the simulation (individually, in groups, from an LMS over
// LTI 1.3 or as a SCORM 1.2 package), how results are compared, and which languages it plays in.
import { useMemo, useState } from 'react';
import { collectTexts } from '../engine/text.js';
import { refKey } from '../templates/ilead/contextualize.js';
import { ltiToolConfig, validatePlatform, PLATFORM_PRESETS, testLaunchContext } from '../delivery/lti.js';
import { buildScormPackage, readZip } from '../delivery/scorm.js';
import { downloadText } from './store.js';
import { newId } from '../engine/authoring.js';
import { Button, Callout, Field, NumberInput, Pill, Seg, Switch, TextInput, copyText } from './ui.jsx';
import { useSample } from './Tailoring.jsx';

export const LANGUAGES = { en: 'English', hi: 'Hindi', 'zh-Hans': 'Chinese (Simplified)', es: 'Spanish', fr: 'French', ja: 'Japanese', ar: 'Arabic', de: 'German', pt: 'Portuguese', id: 'Indonesian' };

const saveMsg = (r, what) => (r === 'saved' ? `${what} saved` : r === 'declined' ? `${what} not saved` : 'Downloads are not available here');

// ---------- how learners play ----------

export function PlayCard({ def, update }) {
  const d = def.delivery;
  const set = (patch) => update((x) => { x.delivery = { ...x.delivery, ...patch }; });
  return (
    <div className="card stack">
      <h3>How learners play</h3>
      <div className="stack" style={{ '--gap': '10px' }}>
        <Switch checked={d.individual !== false} onChange={(v) => set({ individual: v || !d.group })} label="Individual play" />
        <div className="stack" style={{ '--gap': '6px' }}>
          <Switch checked={!!d.group} onChange={(v) => set({ group: v, individual: v ? d.individual : true })} label="Group play: a small group plays one run together and gets one result" />
          {d.group && (
            <div className="row sub-setting">
              <span className="small">Groups of</span>
              <NumberInput className="xs" value={d.groupSize?.min ?? 2} min={2} max={d.groupSize?.max ?? 6} onChange={(v) => set({ groupSize: { ...d.groupSize, min: v } })} aria-label="Smallest group" />
              <span className="small">to</span>
              <NumberInput className="xs" value={d.groupSize?.max ?? 5} min={d.groupSize?.min ?? 2} max={12} onChange={(v) => set({ groupSize: { ...d.groupSize, max: v } })} aria-label="Largest group" />
              <span className="small muted">people. Open responses ask the group to agree one reply. The group report compares groups in Learners and results.</span>
            </div>
          )}
        </div>
        <div className="row">
          <span className="small">Pass mark</span>
          <NumberInput className="xs" value={d.passScore ?? 65} min={0} max={100} onChange={(v) => set({ passScore: v })} aria-label="Pass mark" />
          <span className="small muted">out of 100. Reported to the LMS as passed or failed, and used for the pass rate in reports.</span>
        </div>
      </div>
    </div>
  );
}

export function LeaderboardCard({ def, update }) {
  const d = def.delivery;
  const set = (patch) => update((x) => { x.delivery = { ...x.delivery, ...patch }; });
  return (
    <div className="card stack">
      <div className="row spread"><h3>Leaderboard</h3><Switch checked={!!d.leaderboard} onChange={(v) => set({ leaderboard: v })} label={d.leaderboard ? 'On' : 'Off'} /></div>
      <p className="small muted">Shown in the debrief, after the learner has seen their own result. Learners in a cohort see their cohort; others see everyone on this version.</p>
      {d.leaderboard && (
        <div className="stack" style={{ '--gap': '10px' }}>
          <Field label="Rank by">
            <Seg label="Rank by" value={d.leaderboardMetric || 'score'} onChange={(v) => set({ leaderboardMetric: v })} options={[{ value: 'score', label: 'Overall score' }, { value: 'decisions', label: 'Decision quality' }, { value: 'conversions', label: 'Business results' }]} />
          </Field>
          <Field label="Names shown">
            <Seg label="Names shown" value={d.leaderboardNames || 'nickname'} onChange={(v) => set({ leaderboardNames: v })} options={[{ value: 'nickname', label: 'Nickname the learner picks' }, { value: 'full', label: 'Full name' }, { value: 'anonymous', label: 'Anonymous' }]} />
          </Field>
          <div className="row"><span className="small">Show the top</span><NumberInput className="xs" value={d.leaderboardSize ?? 10} min={3} max={50} onChange={(v) => set({ leaderboardSize: v })} aria-label="Leaderboard size" /><span className="small muted">and always the learner's own place.</span></div>
        </div>
      )}
    </div>
  );
}

// ---------- LTI 1.3 ----------

const EMPTY_PLATFORM = { name: '', issuer: '', clientId: '', deploymentId: '', authUrl: '', tokenUrl: '', jwksUrl: '' };
const PLATFORM_FIELDS = [
  ['name', 'Platform name', 'e.g. Moodle production'],
  ['issuer', 'Issuer', 'https://lms.example.edu'],
  ['clientId', 'Client ID', 'From the platform, after registering the tool'],
  ['deploymentId', 'Deployment ID', 'From the platform'],
  ['authUrl', 'Authorization URL', 'https://…/auth'],
  ['tokenUrl', 'Access token URL', 'https://…/token'],
  ['jwksUrl', 'Public keyset URL', 'https://…/certs'],
];

export function LtiCard({ sim, def, update, notify, onPlay }) {
  const d = def.delivery;
  const [editing, setEditing] = useState(null); // platform draft
  const [errors, setErrors] = useState({});
  const [preset, setPreset] = useState('');
  const [host, setHost] = useState('');
  const [tester, setTester] = useState('');
  const version = sim.versions.at(-1)?.version;
  const config = ltiToolConfig(def, { simId: sim.id, version, toolUrl: d.ltiToolUrl });
  const configText = JSON.stringify(config, null, 2);
  const platforms = d.ltiPlatforms || [];
  const set = (patch) => update((x) => { x.delivery = { ...x.delivery, ...patch }; });

  const save = () => {
    const errs = validatePlatform(editing);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const clean = Object.fromEntries(Object.entries(editing).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    update((x) => {
      const list = x.delivery.ltiPlatforms || [];
      x.delivery.ltiPlatforms = clean.id && list.some((p) => p.id === clean.id) ? list.map((p) => (p.id === clean.id ? clean : p)) : [...list, { ...clean, id: newId('lms') }];
    });
    notify(`${clean.name} saved`);
    setEditing(null);
  };
  const applyPreset = (k) => {
    setPreset(k);
    if (!k) return;
    const base = PLATFORM_PRESETS[k](host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'lms.example.edu');
    setEditing((e) => ({ ...e, ...base, name: e.name || { moodle: 'Moodle', canvas: 'Canvas', blackboard: 'Blackboard Learn' }[k] }));
  };

  return (
    <div className="card stack">
      <div className="row spread"><h3>Launch from an LMS (LTI 1.3)</h3><Switch checked={!!d.lti} onChange={(v) => set({ lti: v })} label={d.lti ? 'On' : 'Off'} /></div>
      <p className="small muted">Learners open the simulation from a course in Moodle, Canvas, Blackboard or any LTI 1.3 platform. They are signed in as themselves, and their score goes back to the gradebook when they finish.</p>
      {d.lti && (
        <div className="stack" style={{ '--gap': '14px' }}>
          <div className="stack" style={{ '--gap': '6px' }}>
            <strong className="small">1. Give the LMS administrator the tool configuration</strong>
            <TextInput label="Tool address" hint="Where your GenieKreator LTI service runs. Your IT team or GenieKreator support gives you this." placeholder="https://geniekreator.example/lti" value={d.ltiToolUrl || ''} onChange={(v) => set({ ltiToolUrl: v })} />
            <div className="row">
              <Button size="sm" onClick={async () => notify((await copyText(configText)) ? 'Tool configuration copied' : 'Copy blocked: select the text below')}>Copy configuration</Button>
              <Button size="sm" variant="ghost" onClick={async () => notify(saveMsg(await downloadText(`${slug(def.meta.name)}-lti-tool.json`, configText), 'Configuration'))}>Download as JSON</Button>
            </div>
            <details><summary className="small">Show the configuration</summary><textarea className="textarea mono" rows={8} readOnly value={configText} aria-label="LTI tool configuration" /></details>
          </div>

          <div className="stack" style={{ '--gap': '6px' }}>
            <strong className="small">2. Register each platform that will launch it</strong>
            {platforms.length === 0 && !editing && <p className="small muted">No platforms yet.</p>}
            {platforms.map((p) => (
              <div key={p.id} className="row spread platform-row">
                <div><strong>{p.name}</strong><div className="small muted">{p.issuer} · client {p.clientId}</div></div>
                <div className="row">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...p }); setErrors({}); }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="danger" onClick={() => { update((x) => { x.delivery.ltiPlatforms = x.delivery.ltiPlatforms.filter((y) => y.id !== p.id); }); notify(`${p.name} removed`); }}>Remove</Button>
                </div>
              </div>
            ))}
            {editing ? (
              <div className="card tight stack" style={{ '--gap': '8px' }}>
                {!editing.id && (
                  <div className="row">
                    <Field label="Start from">
                      <select className="select" value={preset} onChange={(e) => applyPreset(e.target.value)}>
                        <option value="">Any LTI 1.3 platform</option>
                        <option value="moodle">Moodle</option>
                        <option value="canvas">Canvas (cloud)</option>
                        <option value="blackboard">Blackboard Learn</option>
                      </select>
                    </Field>
                    {preset === 'moodle' && <TextInput label="Moodle address" placeholder="lms.example.edu" value={host} onChange={(v) => { setHost(v); setEditing((e) => ({ ...e, ...PLATFORM_PRESETS.moodle(v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'lms.example.edu') })); }} />}
                  </div>
                )}
                <div className="grid cols-2">
                  {PLATFORM_FIELDS.map(([k, label, ph]) => (
                    <div key={k}>
                      <TextInput label={label} placeholder={ph} value={editing[k] || ''} onChange={(v) => setEditing((e) => ({ ...e, [k]: v }))} aria-invalid={!!errors[k]} />
                      {errors[k] && <span className="hint" style={{ color: 'var(--bad)' }}>{errors[k]}</span>}
                    </div>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => { setEditing(null); setErrors({}); }}>Cancel</Button><Button size="sm" variant="primary" onClick={save}>Save platform</Button></div>
              </div>
            ) : <div><Button size="sm" onClick={() => { setEditing({ ...EMPTY_PLATFORM }); setPreset(''); setErrors({}); }}>Add platform</Button></div>}
          </div>

          <div className="stack" style={{ '--gap': '6px' }}>
            <strong className="small">3. Test a launch</strong>
            <p className="small muted">Plays the published version exactly as a learner arriving from the platform would: signed in, with the score message prepared for the gradebook. The result appears in Learners and results.</p>
            <div className="row">
              <input className="input" style={{ maxWidth: 220 }} value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Test learner name" aria-label="Test learner name" />
              {(platforms.length ? platforms : [null]).map((p) => (
                <Button key={p?.id || 'test'} size="sm" disabled={!version} onClick={() => onPlay?.({ lti: testLaunchContext(p, { name: tester.trim() || 'Test Learner', course: def.meta.name }) })}>Launch from {p?.name || 'a test platform'}</Button>
              ))}
            </div>
            {!version && <p className="small" style={{ color: 'var(--warn)' }}>Publish the simulation first: launches always get the published version.</p>}
          </div>
          <Callout icon="i">Signed launches (OpenID Connect and the JWT the platform sends) are verified by the GenieKreator LTI service using the platforms above. This page prepares everything that service needs and lets you rehearse the learner's side.</Callout>
        </div>
      )}
    </div>
  );
}

// ---------- SCORM ----------

export function ScormCard({ sim, def, update, notify, live }) {
  const d = def.delivery;
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const set = (patch) => update((x) => { x.delivery = { ...x.delivery, ...patch }; });
  const unpublished = sim.updatedAt > (sim.publishedAt || sim.versions.at(-1)?.at || 0);
  const build = async () => {
    if (!live) return;
    setBusy(true);
    try {
      const bytes = await buildScormPackage(live.def, { simId: sim.id, version: live.version, title: live.def.meta.name });
      const check = readZip(bytes);
      const ok = ['imsmanifest.xml', 'index.html', 'simulation.json'].every((n) => check[n]?.ok);
      if (!ok) throw new Error('The package failed its own check.');
      const name = `${slug(live.def.meta.name)}-v${live.version}-scorm12.zip`;
      setLast({ name, size: bytes.length, files: Object.keys(check).length, version: live.version });
      notify(saveMsg(await downloadText(name, bytes), 'SCORM package'));
    } catch (e) {
      notify(`The package could not be built: ${e.message}`);
    }
    setBusy(false);
  };
  return (
    <div className="card stack">
      <div className="row spread"><h3>SCORM package</h3><Switch checked={!!d.scorm} onChange={(v) => set({ scorm: v })} label={d.scorm ? 'On' : 'Off'} /></div>
      <p className="small muted">A zip you upload to any LMS as a SCORM 1.2 course. It plays offline inside the LMS, with no server, and reports progress, the score out of 100 and passed or failed.</p>
      {d.scorm && (
        <div className="stack" style={{ '--gap': '8px' }}>
          <div className="row">
            <Button variant="primary" disabled={!live || busy} onClick={build}>{busy ? 'Building…' : live ? `Download package (version ${live.version})` : 'Publish first'}</Button>
            {live && unpublished && <span className="small" style={{ color: 'var(--warn)' }}>Your latest changes are not published, so they are not in the package.</span>}
          </div>
          {last && <p className="small muted">{last.name}: {last.files} files, {(last.size / 1024 / 1024).toFixed(1)} MB, checked. Open responses are scored by the built-in evaluator inside the LMS.</p>}
          <p className="small muted">Pass mark: {d.passScore ?? 65}. Each new version needs a new upload; learners mid-way keep their LMS progress.</p>
        </div>
      )}
    </div>
  );
}

// ---------- languages ----------

const isStale = (entry, source) => entry && typeof entry === 'object' && entry.source !== undefined && entry.source !== source;
const textOf = (e) => (typeof e === 'string' ? e : e?.text || '');

export function translationStatus(def, lang) {
  const items = collectTexts(def).filter((t) => String(t.text).trim());
  const t = def.translations?.[lang] || {};
  let done = 0; let reviewed = 0; let stale = 0;
  for (const i of items) {
    const e = t[refKey(i.ref)];
    if (!textOf(e).trim()) continue;
    if (isStale(e, i.text)) { stale += 1; continue; }
    done += 1;
    if (e?.status === 'reviewed') reviewed += 1;
  }
  return { total: items.length, done, reviewed, stale, missing: items.length - done - stale };
}

function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function LanguagesCard({ def, update, notify }) {
  const sample = useSample();
  const langs = def.delivery.languages || ['en'];
  const [adding, setAdding] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [importText, setImportText] = useState('');
  const items = useMemo(() => collectTexts(def).filter((t) => String(t.text).trim()), [def]);
  const available = Object.keys(LANGUAGES).filter((l) => !langs.includes(l));
  const setEntry = (lang, key, entry) => update((x) => { x.translations ||= {}; x.translations[lang] ||= {}; if (entry) x.translations[lang][key] = entry; else delete x.translations[lang][key]; });

  const translate = async (lang, scope) => {
    const t = def.translations?.[lang] || {};
    const todo = items.filter((i) => { const e = t[refKey(i.ref)]; return scope === 'all' || !textOf(e).trim() || isStale(e, i.text); });
    if (!todo.length) { notify('Nothing left to translate'); return; }
    setBusy({ lang, done: 0, total: todo.length });
    let done = 0;
    const batches = [];
    for (let i = 0; i < todo.length; i += 30) batches.push(todo.slice(i, i + 30));
    const out = {};
    for (const b of batches) {
      try {
        const reply = await sample.json([
          `Translate these texts from a business leadership simulation into ${LANGUAGES[lang]}. Keep every {{token}} exactly as it is (they are names filled in later). Keep the tone natural and professional, as a local business person would write. No em dashes.`,
          'Reply with only JSON: {"items":[{"k": string, "text": string}]} with the same k values.',
          JSON.stringify(b.map((i) => ({ k: refKey(i.ref), text: i.text }))),
        ].join('\n'), { cache: false });
        for (const r of reply?.items || []) if (r?.k && typeof r.text === 'string') out[r.k] = r.text;
      } catch (e) {
        if (e?.code === 'rate_limited') { notify('Genie is busy. What was translated so far is kept; try again in a minute.'); break; }
      }
      done += b.length;
      setBusy({ lang, done, total: todo.length });
    }
    const n = Object.keys(out).length;
    if (n) update((x) => {
      x.translations ||= {}; x.translations[lang] ||= {};
      for (const i of todo) { const k = refKey(i.ref); if (out[k]) x.translations[lang][k] = { text: out[k], source: i.text, status: 'draft', by: 'genie' }; }
    });
    notify(n ? `Genie translated ${n} text${n === 1 ? '' : 's'}. Review them before learners see them.` : 'Genie could not translate this time. You can translate by hand or import a file.');
    setBusy(null);
  };

  const exportCsv = async (lang) => {
    const t = def.translations?.[lang] || {};
    const rows = [['key', 'where', 'English', LANGUAGES[lang]], ...items.map((i) => [refKey(i.ref), i.label, i.text, textOf(t[refKey(i.ref)])])];
    notify(saveMsg(await downloadText(`${slug(def.meta.name)}-${lang}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n')), 'Translation file'));
  };
  const importCsv = (lang) => {
    const rows = parseCsv(importText);
    const byKey = new Map(items.map((i) => [refKey(i.ref), i]));
    let n = 0;
    update((x) => {
      x.translations ||= {}; x.translations[lang] ||= {};
      for (const r of rows) {
        const [k, , , tr] = r;
        const src = byKey.get(k);
        if (src && tr?.trim()) { x.translations[lang][k] = { text: tr.trim(), source: src.text, status: 'reviewed', by: 'you' }; n += 1; }
      }
    });
    setImportText('');
    notify(n ? `Imported ${n} translation${n === 1 ? '' : 's'}` : 'No rows matched. Use the file exported here, with the translation in the fourth column.');
  };

  return (
    <div className="card stack">
      <h3>Languages</h3>
      <p className="small muted">Every text learners read ({items.length} of them) can be translated here. Learners pick their language on the welcome screen. Anything not yet translated shows in {LANGUAGES[def.delivery.defaultLanguage || 'en']}.</p>
      <div className="stack" style={{ '--gap': '6px' }}>
        {langs.map((l) => {
          const st = l === 'en' ? null : translationStatus(def, l);
          return (
            <div key={l} className="lang-row">
              <div className="row spread">
                <strong>{LANGUAGES[l] || l}</strong>
                {l === 'en' ? <Pill tone="good">Source, {items.length} texts</Pill> : (
                  <div className="row">
                    <Pill tone={st.done === st.total ? 'good' : 'warn'}>{st.done} of {st.total} translated{st.reviewed ? `, ${st.reviewed} reviewed` : ''}{st.stale ? `, ${st.stale} out of date` : ''}</Pill>
                    <Button size="sm" variant="ghost" onClick={() => setOpen(open === l ? null : l)} aria-expanded={open === l}>{open === l ? 'Close' : 'Translate'}</Button>
                    <Button size="sm" variant="ghost" className="danger" onClick={() => { update((x) => { x.delivery.languages = x.delivery.languages.filter((y) => y !== l); }); notify(`${LANGUAGES[l]} removed. Its translations are kept if you add it again.`); }}>Remove</Button>
                  </div>
                )}
              </div>
              {l !== 'en' && open === l && (
                <div className="stack" style={{ '--gap': '10px', paddingTop: 10 }}>
                  <div className="lang-progress" aria-hidden="true"><span className="done" style={{ width: `${(st.done / st.total) * 100}%` }} /><span className="stale" style={{ width: `${(st.stale / st.total) * 100}%` }} /></div>
                  <div className="row">
                    {sample && <Button size="sm" variant="primary" disabled={!!busy} onClick={() => translate(l, 'missing')}>{busy?.lang === l ? `Translating ${busy.done} of ${busy.total}…` : `Translate ${st.missing + st.stale} with Genie`}</Button>}
                    <Button size="sm" onClick={() => exportCsv(l)}>Export for translators (CSV)</Button>
                    {st.done > st.reviewed && <Button size="sm" variant="ghost" onClick={() => { update((x) => { for (const e of Object.values(x.translations[l] || {})) if (e && typeof e === 'object' && e.text) e.status = 'reviewed'; }); notify('All current translations marked as reviewed'); }}>Mark all as reviewed</Button>}
                  </div>
                  <details>
                    <summary className="small">Import a translated file</summary>
                    <div className="stack" style={{ '--gap': '6px', paddingTop: 6 }}>
                      <textarea className="textarea mono" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste the CSV exported above, with the fourth column filled in" aria-label="Translated CSV" />
                      <div><Button size="sm" disabled={!importText.trim()} onClick={() => importCsv(l)}>Import</Button></div>
                    </div>
                  </details>
                  <Seg label="Show" value={filter} onChange={setFilter} options={[{ value: 'todo', label: 'Needs work' }, { value: 'draft', label: 'Not reviewed' }, { value: 'all', label: 'All' }]} />
                  <div className="tr-table">
                    {items.filter((i) => {
                      const e = def.translations?.[l]?.[refKey(i.ref)];
                      if (filter === 'all') return true;
                      if (filter === 'todo') return !textOf(e).trim() || isStale(e, i.text);
                      return textOf(e).trim() && e?.status !== 'reviewed';
                    }).slice(0, 60).map((i) => {
                      const k = refKey(i.ref);
                      const e = def.translations?.[l]?.[k];
                      const stale = isStale(e, i.text);
                      return (
                        <div key={k} className="tr-row">
                          <div className="small"><span className="muted">{i.label}</span><p className="ink2">{i.text}</p></div>
                          <div className="stack" style={{ '--gap': '4px' }}>
                            <textarea className="textarea" rows={2} dir={l === 'ar' ? 'rtl' : undefined} value={textOf(e)} onChange={(ev) => setEntry(l, k, ev.target.value.trim() ? { text: ev.target.value, source: i.text, status: 'draft', by: 'you' } : null)} aria-label={`${LANGUAGES[l]} for ${i.label}`} />
                            <div className="row small">
                              {stale && <span style={{ color: 'var(--warn)' }}>The English changed since this was translated.</span>}
                              {textOf(e).trim() && (e?.status === 'reviewed' && !stale ? <span style={{ color: 'var(--good)' }}>Reviewed</span> : <Button size="sm" variant="ghost" onClick={() => setEntry(l, k, { ...(typeof e === 'object' ? e : { text: e }), source: i.text, status: 'reviewed' })}>Mark reviewed</Button>)}
                              {e?.by === 'genie' && <span className="muted">by Genie</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="small muted">Showing up to 60 at a time. Buttons, labels and help in the learner's screens stay in English in this version.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {available.length > 0 && (
        <div className="row">
          <select className="select" style={{ maxWidth: 240 }} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Language to add">
            <option value="">Add a language…</option>
            {available.map((l) => <option key={l} value={l}>{LANGUAGES[l]}</option>)}
          </select>
          <Button size="sm" disabled={!adding} onClick={() => { update((x) => { x.delivery.languages = [...x.delivery.languages, adding]; }); setOpen(adding); notify(`${LANGUAGES[adding]} added. Translate it before you publish.`); setAdding(''); }}>Add</Button>
        </div>
      )}
    </div>
  );
}

export const slug = (s) => String(s || 'simulation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'simulation';
