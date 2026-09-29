import { useEffect, useMemo, useRef, useState } from 'react';
import { playBot, BOTS } from '../../engine/bots.js';
import { computeReport } from '../../engine/report.js';
import { aggregate, syntheticBenchmark, idealProgression } from '../../engine/group.js';
import { USER_SECTIONS, GROUP_SECTIONS } from '../../templates/ilead/report-defaults.js';
import LeadershipReport from '../../report/LeadershipReport.jsx';
import GroupReport from '../../report/GroupReport.jsx';
import { downloadReport, fileSlug } from '../../report/download.js';
import '../../report/report.css';
import { Button, Callout, Field, NumberInput, Pill, SectionHead, Switch, TokenArea, Seg, StylePill } from '../ui.jsx';

const MISSING = /NO STRING AVAILABLE/i;
const USE = ['Low', 'Moderate', 'High'];

export default function Report({ def, update, advanced, notify }) {
  const [tab, setTab] = useState('competencies');
  const missing = Object.values(def.report.styleInsights).reduce((n, g) => n + Object.values(g).filter((v) => !v || MISSING.test(v)).length, 0);
  const drafted = (def.meta.drafted || []).length;
  const tabs = [
    ['competencies', 'Competencies'],
    ['outcome', 'Outcome and adaptability'],
    ['styles', `Style insights${missing ? ` (${missing} missing)` : drafted ? ` (${drafted} drafted)` : ''}`],
    ['actions', 'Action insights'],
    ['reflect', 'Reflection'],
    ['layout', 'Layout'],
    ['group', 'Group report'],
    ['sample', 'Sample report'],
    ['sampleGroup', 'Sample group report'],
  ];
  return (
    <div>
      <SectionHead eyebrow="Build" title="Report">
        Two reports, both modelled on the original iLead reports. Each learner gets a leadership report at the end of the quarter; facilitators get a group report for a cohort, compared with a benchmark. You write the words for each band; the engine picks the band.
      </SectionHead>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'competencies' && <Competencies def={def} update={update} advanced={advanced} />}
      {tab === 'outcome' && (
        <div className="grid cols-2">
          <div className="card stack">
            <h3>Result against target</h3>
            {[['low', 'Below 70% of target'], ['medium', '70% to 99%'], ['high', 'Target reached']].map(([k, label]) => (
              <TokenArea key={k} def={def} label={label} rows={3} tokens="report" value={def.report.objective[k]} onChange={(v) => update((d) => { d.report.objective[k] = v; })} />
            ))}
          </div>
          <div className="card stack">
            <h3>Overall adaptability</h3>
            {[['low', 'Right style less than 40% of the time'], ['moderate', '40% to 69%'], ['high', '70% or more']].map(([k, label]) => (
              <TokenArea key={k} def={def} label={label} rows={3} tokens="report" value={def.report.adaptability[k]} onChange={(v) => update((d) => { d.report.adaptability[k] = v; })} />
            ))}
            <p className="small muted">Start a line with a dash to show it as a separate point.</p>
          </div>
          {Object.entries(def.report.consistency).map(([id, c]) => (
            <div key={id} className="card stack">
              <h3>Consistency: {c.name}</h3>
              <TokenArea def={def} label="What this measures" rows={2} value={c.description} onChange={(v) => update((d) => { d.report.consistency[id].description = v; })} />
              {Object.keys(c.bands).map((b) => (
                <TokenArea key={b} def={def} label={MISMATCH[b] || b} rows={2} value={c.bands[b]} onChange={(v) => update((d) => { d.report.consistency[id].bands[b] = v; })} />
              ))}
            </div>
          ))}
        </div>
      )}
      {tab === 'styles' && <StyleInsights def={def} update={update} />}
      {tab === 'actions' && (
        <div className="stack">
          {Object.entries(def.report.actionInsights).map(([id, ai]) => {
            const action = def.actions.find((a) => a.id === id);
            return (
              <details key={id} className="card">
                <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{action?.name || id}</summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  <TokenArea def={def} label="What this action is for" rows={2} value={ai.description} onChange={(v) => update((d) => { d.report.actionInsights[id].description = v; })} />
                  {Object.keys(ai.bands).map((b) => (
                    <TokenArea key={b} def={def} label={{ HighPositive: 'Mostly positive (75%+)', LowPositive: 'More positive than not', LowNegative: 'More negative than not', HighNegative: 'Mostly negative', NoImpact: 'Never used' }[b] || b} rows={2} value={ai.bands[b]} onChange={(v) => update((d) => { d.report.actionInsights[id].bands[b] = v; })} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {tab === 'reflect' && (
        <div className="grid cols-2">
          <div className="card stack">
            <h3>Food for thought</h3>
            {def.report.foodForThought.map((q, i) => (
              <div key={i} className="stack" style={{ '--gap': '6px', paddingTop: 8, borderTop: i ? '1px solid var(--line)' : 0 }}>
                <input className="input" aria-label={`Question ${i + 1}`} value={q.q} onChange={(e) => update((d) => { d.report.foodForThought[i].q = e.target.value; })} />
                <textarea className="textarea" rows={3} aria-label={`Answer ${i + 1}`} value={q.a} onChange={(e) => update((d) => { d.report.foodForThought[i].a = e.target.value; })} />
              </div>
            ))}
          </div>
          <div className="card stack">
            <h3>Key takeaways</h3>
            {def.report.takeaways.map((t, i) => (
              <textarea key={i} className="textarea" rows={2} aria-label={`Takeaway ${i + 1}`} value={t} onChange={(e) => update((d) => { d.report.takeaways[i] = e.target.value; })} />
            ))}
            <div><Button size="sm" onClick={() => update((d) => { d.report.takeaways.push(''); })}>Add takeaway</Button></div>
          </div>
        </div>
      )}
      {tab === 'layout' && <Layout def={def} update={update} />}
      {tab === 'group' && <GroupCopy def={def} update={update} />}
      {tab === 'sample' && <SampleReport def={def} notify={notify} />}
      {tab === 'sampleGroup' && <SampleGroup def={def} notify={notify} />}
    </div>
  );
}

function Competencies({ def, update, advanced }) {
  return (
    <div className="stack">
      {advanced && (
        <div className="card row">
          <span className="advanced-tag">Engine</span>
          <Field label="Points of team change per score point" id="scale" hint="Upskill, motivate and enable start at 5 and move by the team's average change divided by this.">
            <NumberInput id="scale" value={def.report.scoreScale} min={1} max={20} onChange={(v) => update((d) => { d.report.scoreScale = v; })} />
          </Field>
          <p className="small muted grow">Adaptive leadership = share of right weekly styles × 10. Drive for results = share of target × 8 (125% of target scores 10).</p>
        </div>
      )}
      {def.report.competencies.map((c, ci) => (
        <details key={c.id} className="card" open={ci === 0}>
          <summary style={{ cursor: 'pointer' }} className="row spread">
            <span className="row"><strong>{c.name}</strong><Pill>{c.ontologyCode}</Pill></span>
            <span onClick={(e) => e.stopPropagation()}><Switch checked={c.enabled} onChange={(v) => update((d) => { d.report.competencies[ci].enabled = v; })} label="In report" /></span>
          </summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="small ink2">{c.description}</p>
            {c.bands.map((b, bi) => (
              <div key={b.label} className="grid" style={{ gridTemplateColumns: '130px 1fr', gap: 10, alignItems: 'start' }}>
                <div className="stack" style={{ '--gap': '2px' }}>
                  <strong className="small">{b.label}</strong>
                  <span className="small muted num">{b.min} to {b.max}</span>
                </div>
                <textarea className="textarea" rows={2} aria-label={`${c.name} ${b.label}`} value={b.text} onChange={(e) => update((d) => { d.report.competencies[ci].bands[bi].text = e.target.value; })} />
              </div>
            ))}
            <p className="small muted">Mapped to the KNOLSKAPE Skills Ontology ({c.ontologyCode}), so GenieTracker can roll scores into readiness dashboards.</p>
          </div>
        </details>
      ))}
    </div>
  );
}

function StyleInsights({ def, update }) {
  const [styleId, setStyleId] = useState(def.leadership.styles[0].id);
  const grid = def.report.styleInsights[styleId];
  return (
    <div className="stack">
      <p className="small ink2">For each style: how often the learner used it compared with how often it was needed (use), and how often it was the right call when they did (accuracy).</p>
      <Seg value={styleId} onChange={setStyleId} options={def.leadership.styles.map((s) => ({ value: s.id, label: s.name }))} label="Style" />
      <div className="row"><StylePill def={def} styleId={styleId} /><span className="small ink2">{def.report.styleDescriptions[styleId]}</span></div>
      <div className="scroll-x">
        <table className="table" style={{ minWidth: 720 }}>
          <thead><tr><th>Use vs accuracy</th>{USE.map((a) => <th key={a}>{a} accuracy</th>)}</tr></thead>
          <tbody>
            {USE.map((u) => (
              <tr key={u}>
                <td><strong>{u} use</strong></td>
                {USE.map((a) => {
                  const key = `${u}Use${a}Accuracy`;
                  const v = grid[key] || '';
                  const bad = !v || MISSING.test(v);
                  const drafted = (def.meta.drafted || []).includes(`${styleId}:${key}`);
                  return (
                    <td key={a} style={{ verticalAlign: 'top', background: bad ? 'var(--bad-soft)' : undefined }}>
                      {bad && <Pill tone="bad">Write this</Pill>}
                      {drafted && !bad && <Pill tone="warmth">Auto-drafted, review</Pill>}
                      <textarea className="textarea" rows={5} aria-label={`${u} use, ${a} accuracy`} value={bad ? '' : v} placeholder={bad ? 'Legacy text was missing. Write the insight for this combination.' : ''} onChange={(e) => update((d) => { d.report.styleInsights[styleId][key] = e.target.value; d.meta.drafted = (d.meta.drafted || []).filter((x) => x !== `${styleId}:${key}`); })} style={{ marginTop: bad || drafted ? 6 : 0, fontSize: 12.5 }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Use the style field in the text to insert the style's name.</p>
    </div>
  );
}

const MISMATCH = { LowMismatch: 'Low deviation (under 25%)', ModerateMismatch: 'Moderate deviation (25% to 49%)', HighMismatch: 'High deviation (50% or more)', NoMismatch: 'No measurable action' };
const BENCH = [
  { value: 'auto', label: 'Automatic' },
  { value: 'everyone', label: 'Everyone who played' },
  { value: 'synthetic', label: 'Synthetic learners' },
];

function Layout({ def, update }) {
  const us = def.report.sections || {};
  const gs = def.report.group?.sections || {};
  return (
    <div className="grid cols-2">
      <div className="card stack">
        <h3>Learner report</h3>
        <p className="small muted">What each learner sees in the Leadership report tab of their debrief, and in the copy they download.</p>
        {Object.entries(USER_SECTIONS).map(([k, label]) => <Switch key={k} checked={us[k] !== false} onChange={(v) => update((d) => { d.report.sections = { ...(d.report.sections || {}), [k]: v }; })} label={label} />)}
        <TokenArea def={def} label="About this simulation (opens the report)" rows={4} value={def.report.about} onChange={(v) => update((d) => { d.report.about = v; })} />
      </div>
      <div className="card stack">
        <h3>Group report</h3>
        <p className="small muted">What facilitators see in Learners and results, and in the copy they download for the client.</p>
        {Object.entries(GROUP_SECTIONS).map(([k, label]) => <Switch key={k} checked={gs[k] !== false} onChange={(v) => update((d) => { d.report.group.sections = { ...(d.report.group.sections || {}), [k]: v }; })} label={label} />)}
        <Field label="Benchmark" hint="Automatic compares a cohort with everyone who has played once at least 20 people have, and uses 30 synthetic learners of mixed ability until then, or when the report already covers everyone.">
          <Seg label="Benchmark" value={def.report.group?.benchmark || 'auto'} onChange={(v) => update((d) => { d.report.group.benchmark = v; })} options={BENCH} />
        </Field>
      </div>
    </div>
  );
}

function ListEditor({ items, onChange, label, rows = 2, addLabel = 'Add a point' }) {
  const list = items || [];
  return (
    <div className="stack" style={{ '--gap': '6px' }}>
      {list.map((t, i) => (
        <div key={i} className="row nowrap" style={{ alignItems: 'flex-start' }}>
          <textarea className="textarea grow" rows={rows} aria-label={`${label} ${i + 1}`} value={t} onChange={(e) => onChange(list.map((x, k) => (k === i ? e.target.value : x)))} />
          <Button size="sm" variant="ghost" onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}>Remove</Button>
        </div>
      ))}
      <div><Button size="sm" onClick={() => onChange([...list, ''])}>{addLabel}</Button></div>
    </div>
  );
}

const INTRO_FIELDS = [
  ['competencies', 'Competency proficiency'], ['group', 'What "Group" means'], ['benchmark', 'What "Benchmark" means'], ['distribution', 'Percentage distribution'], ['completion', 'Completion rate'],
  ['business', 'Business achievement'], ['conversions', 'Conversions'], ['revenue', 'Revenue'], ['maxRevenue', 'Maximum revenue'], ['averages', 'Average conversions and revenue'], ['overAchievers', 'Over-achievers'], ['smp', 'Skill, morale and performance'],
  ['styles', 'Leadership style'], ['adaptability', 'Style adaptability'], ['preferences', 'Style preferences'], ['quadrant', 'Styles distribution'], ['proportion', 'Proportion'], ['accuracy', 'Accuracy'],
  ['consistency', 'Consistency'], ['desired', 'Desired style'], ['intended', 'Intended style'], ['actual', 'Actual style'],
  ['funnel', 'Sales funnel'], ['ideal', 'Ideal progression'], ['progression', 'Actual progression'], ['actions', 'Actions'], ['time', 'Management style'], ['top', 'Top performers'], ['average', 'Average performers'], ['bottom', 'Bottom performers'], ['takeaways', 'Key takeaways'],
];
const NOTE_FIELDS = [['distribution', 'Percentage distribution'], ['completion', 'Completion rate'], ['smp', 'Skill, morale and performance'], ['adaptability', 'Style adaptability'], ['funnel', 'Sales funnel'], ['actions', 'Actions'], ['time', 'Management style']];
const LEVEL_NAMES = ['Novice', 'Emerging', 'Competent', 'Proficient', 'Role Model'];

function GroupCopy({ def, update }) {
  const [part, setPart] = useState('questions');
  const [styleId, setStyleId] = useState(def.leadership.styles[0].id);
  const G = def.report.group;
  const set = (fn) => update((d) => fn(d.report.group));
  return (
    <div className="stack">
      <p className="small ink2">The group report's words, from the original iLead group report. Insights are written about "the group"; the engine picks the band from the group's average. Discussion notes and key takeaway questions are what facilitators use to run the debrief conversation.</p>
      <Seg label="Part" value={part} onChange={setPart} options={[{ value: 'questions', label: 'Key takeaway questions' }, { value: 'notes', label: 'Discussion notes' }, { value: 'intro', label: 'Section introductions' }, { value: 'comps', label: 'Competency insights' }, { value: 'styles', label: 'Style insights' }, { value: 'cons', label: 'Consistency' }]} />
      {part === 'questions' && (
        <div className="grid cols-2">
          {G.questions.map((q, i) => (
            <div key={i} className="card stack">
              <div className="row nowrap"><input className="input grow" aria-label={`Theme ${i + 1}`} value={q.title} onChange={(e) => set((g) => { g.questions[i].title = e.target.value; })} /><Button size="sm" variant="ghost" onClick={() => set((g) => { g.questions.splice(i, 1); })}>Remove theme</Button></div>
              <ListEditor label="Question" addLabel="Add a question" items={q.items} onChange={(items) => set((g) => { g.questions[i].items = items; })} />
            </div>
          ))}
          <div><Button onClick={() => set((g) => { g.questions.push({ title: 'New theme', items: [''] }); })}>Add a theme</Button></div>
        </div>
      )}
      {part === 'notes' && (
        <div className="grid cols-2">
          {NOTE_FIELDS.map(([k, label]) => (
            <div key={k} className="card stack">
              <h3>{label}</h3>
              <ListEditor label={`${label} note`} items={G.notes[k]} onChange={(items) => set((g) => { g.notes[k] = items; })} />
            </div>
          ))}
        </div>
      )}
      {part === 'intro' && (
        <div className="card stack">
          <TokenArea def={def} label="Cover line (the number of learners goes where {{n}} is)" rows={2} value={G.cover} onChange={(v) => set((g) => { g.cover = v; })} />
          <Field label="About this report"><ListEditor label="About point" items={G.aboutReport} onChange={(items) => set((g) => { g.aboutReport = items; })} /></Field>
          <div className="grid cols-2">
            {INTRO_FIELDS.map(([k, label]) => <TokenArea key={k} def={def} label={label} rows={3} value={G.intro[k]} onChange={(v) => set((g) => { g.intro[k] = v; })} />)}
          </div>
        </div>
      )}
      {part === 'comps' && def.report.competencies.map((c) => (
        <details key={c.id} className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{c.name}</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <TokenArea def={def} label="What it means" rows={2} value={G.competencies[c.id]?.description} onChange={(v) => set((g) => { g.competencies[c.id] ||= { description: '', bands: {} }; g.competencies[c.id].description = v; })} />
            {LEVEL_NAMES.map((b, i) => <TokenArea key={b} def={def} label={`${b} (${i * 2} to ${i * 2 + 2})`} rows={3} value={G.competencies[c.id]?.bands?.[b]} onChange={(v) => set((g) => { g.competencies[c.id] ||= { description: '', bands: {} }; g.competencies[c.id].bands[b] = v; })} />)}
          </div>
        </details>
      ))}
      {part === 'styles' && (
        <div className="stack">
          <Seg value={styleId} onChange={setStyleId} options={def.leadership.styles.map((st) => ({ value: st.id, label: st.name }))} label="Style" />
          <div className="grid cols-2">
            <TokenArea def={def} label="What the style is" rows={3} value={G.styleDescriptions[styleId]} onChange={(v) => set((g) => { g.styleDescriptions[styleId] = v; })} />
            <TokenArea def={def} label="When it is the group's most used style" rows={3} value={G.preference[styleId]} onChange={(v) => set((g) => { g.preference[styleId] = v; })} />
          </div>
          <div className="scroll-x">
            <table className="table" style={{ minWidth: 720 }}>
              <thead><tr><th>Use vs accuracy</th>{USE.map((a) => <th key={a}>{a} accuracy</th>)}</tr></thead>
              <tbody>
                {USE.map((u) => (
                  <tr key={u}>
                    <td><strong>{u} use</strong></td>
                    {USE.map((a) => {
                      const key = `${u}Use${a}Accuracy`;
                      return <td key={a} style={{ verticalAlign: 'top' }}><textarea className="textarea" rows={5} aria-label={`Group, ${u} use, ${a} accuracy`} value={G.styleInsights[styleId]?.[key] || ''} onChange={(e) => set((g) => { g.styleInsights[styleId] ||= {}; g.styleInsights[styleId][key] = e.target.value; })} style={{ fontSize: 12.5 }} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">The Low use, High accuracy texts were missing in the original and have been drafted. Use the style field in the text to insert the style's name.</p>
        </div>
      )}
      {part === 'cons' && (
        <div className="grid cols-2">
          {Object.entries(G.consistency).map(([id, c]) => (
            <div key={id} className="card stack">
              <h3>{def.report.consistency[id]?.name || id}</h3>
              <TokenArea def={def} label="What this measures" rows={2} value={c.description} onChange={(v) => set((g) => { g.consistency[id].description = v; })} />
              {Object.keys(c.bands).map((b) => <TokenArea key={b} def={def} label={MISMATCH[b] || b} rows={2} value={c.bands[b]} onChange={(v) => set((g) => { g.consistency[id].bands[b] = v; })} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SampleReport({ def, notify }) {
  const [bot, setBot] = useState('expert');
  const [seed, setSeed] = useState(7);
  const ref = useRef(null);
  const report = useMemo(() => computeReport(def, playBot(def, bot, seed).state), [def, bot, seed]);
  return (
    <div className="stack">
      <div className="row">
        <Seg value={bot} onChange={setBot} options={Object.entries(BOTS).map(([id, b]) => ({ value: id, label: b.name }))} label="Played by" />
        <Button size="sm" onClick={() => setSeed((s) => s + 1)}>Play again</Button>
        <span className="grow" />
        <Button size="sm" onClick={async () => { const r = await downloadReport(ref.current, `${def.meta?.name || 'iLead'} sample leadership report`, `${fileSlug(def.meta?.name)}-sample-report`); notify?.(r === 'saved' ? 'Sample report downloaded' : r === 'declined' ? 'Download cancelled' : 'Downloads are not available here'); }}>Download as HTML</Button>
      </div>
      <p className="small muted">The report exactly as a learner sees it, from one quarter played by a bot. {BOTS[bot].description}</p>
      <div className="report-frame"><LeadershipReport ref={ref} def={def} report={report} name={`${BOTS[bot].name} (sample)`} date={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} /></div>
    </div>
  );
}

// Synthetic learners for the sample group report and as a benchmark. Cached per definition.
const cache = new Map();
export function useSynthetic(def, n, seed, enabled = true) {
  const key = useMemo(() => `${n}:${seed}:${JSON.stringify([def.actors, def.actions, def.funnel, def.timeline, def.leadership.styles, def.report.competencies.map((c) => c.enabled), def.decisions?.points?.length])}`, [def, n, seed]);
  const [state, setState] = useState(() => cache.get(key) || null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    if (cache.has(key)) { setState(cache.get(key)); return undefined; }
    let live = true;
    setState(null);
    syntheticBenchmark(def, n, { seed, onProgress: (p) => live && setProgress(p) }).then((rps) => {
      if (!live) return;
      const v = { rps, agg: aggregate(def, rps) };
      if (cache.size > 12) cache.clear();
      cache.set(key, v);
      setState(v);
    });
    return () => { live = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data: state, progress };
}

export function useIdeal(def) {
  return useMemo(() => idealProgression(def), [def.actors, def.actions, def.funnel, def.timeline]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SampleGroup({ def, notify }) {
  const group = useSynthetic(def, 24, 1100);
  const bench = useSynthetic(def, 30, 4242);
  const ideal = useIdeal(def);
  const ref = useRef(null);
  const ready = group.data && bench.data;
  return (
    <div className="stack">
      <div className="row">
        <p className="small muted grow">A group report for 24 synthetic learners of mixed ability, compared with a benchmark of 30 more. Real cohorts show in Learners and results.</p>
        <Button size="sm" disabled={!ready} onClick={async () => { const r = await downloadReport(ref.current, `${def.meta?.name || 'iLead'} sample group report`, `${fileSlug(def.meta?.name)}-sample-group-report`); notify?.(r === 'saved' ? 'Sample group report downloaded' : r === 'declined' ? 'Download cancelled' : 'Downloads are not available here'); }}>Download as HTML</Button>
      </div>
      {!ready && <Callout icon="i">Playing synthetic learners through the quarter… {Math.round(((group.progress + bench.progress) / 2) * 100)}%</Callout>}
      {ready && <div className="report-frame"><GroupReport ref={ref} def={def} group={group.data.agg} bench={bench.data.agg} benchLabel="Benchmark" benchNote="30 synthetic learners" title="Group report" subtitle="Sample cohort of synthetic learners" ideal={ideal} date={new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} /></div>}
    </div>
  );
}
