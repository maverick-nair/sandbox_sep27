// Learners and results: cohorts to run the simulation with, and what happened when people played
// it. A group report (scores, reasoning quality, concepts to reinforce, each decision), the
// leaderboard, groups, every learner's result and the scores prepared for LMS gradebooks.
import { useMemo, useState } from 'react';
import { summarise } from '../results.js';
import { Histogram, BarList, Legend } from '../charts.jsx';
import { Leaderboard } from '../../learner/Debrief.jsx';
import { buildDebrief, resultRecord } from '../../learner/model.js';
import { playSynthetic } from '../../engine/bots.js';
import { renderText } from '../../engine/text.js';
import { textVars, TIERS, INTERACTION_TYPES } from '../../engine/decisions.js';
import { CRITERIA_LIBRARY } from '../../engine/nlp.js';
import { downloadText } from '../store.js';
import { slug } from '../Delivery.jsx';
import { Button, Callout, Field, Pill, SectionHead, Seg, TextInput, copyText } from '../ui.jsx';

const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const day = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const isOpen = (c, now = Date.now()) => c.status !== 'closed' && (!c.closes || new Date(`${c.closes}T23:59:59`).getTime() >= now) && (!c.opens || new Date(`${c.opens}T00:00:00`).getTime() <= now);

export default function Results({ def, update, sim, results, notify, onPlay, focus }) {
  const [tab, setTab] = useState(focus?.tab || 'report');
  const [version, setVersion] = useState('all');
  const [cohort, setCohort] = useState('all');
  const [showPractice, setShowPractice] = useState(true);
  const all = results?.forSim(sim.id) || [];
  const rows = all.filter((r) => (version === 'all' || String(r.version) === version) && (cohort === 'all' || (cohort === 'none' ? !r.cohortId : r.cohortId === cohort)) && (showPractice || !r.practice));
  const cohorts = def.delivery.cohorts || [];
  const versions = [...new Set(all.map((r) => r.version).filter(Boolean))].sort((a, b) => a - b);
  const live = [...(sim.versions || [])].reverse().find((v) => v.def);
  const practiceCount = all.filter((r) => r.practice).length;

  const addPractice = async (n = 24) => {
    if (!live) return;
    notify(`Playing ${n} practice learners…`);
    const names = ['Asha', 'Ben', 'Chen', 'Divya', 'Eli', 'Fatima', 'Gabriel', 'Hana', 'Ivan', 'Jia', 'Kofi', 'Lena', 'Mateo', 'Nadia', 'Omar', 'Priya', 'Quinn', 'Rahul', 'Sofia', 'Tariq', 'Uma', 'Victor', 'Wen', 'Yara'];
    const open = cohorts.filter((c) => isOpen(c));
    for (let i = 0; i < n; i++) {
      const seed = 9000 + Math.floor(Math.random() * 90000);
      const skill = 0.05 + ((i * 37) % 80) / 100;
      const run = playSynthetic(live.def, seed, skill);
      const name = `${names[i % names.length]} (practice)`;
      const d = buildDebrief(live.def, run.state, { name });
      const rec = resultRecord(live.def, run.state, d, { name, nickname: names[i % names.length], cohortId: open.length ? open[i % open.length].id : null, practice: true, simId: sim.id, version: live.version, group: live.def.delivery.group && i % 4 === 0 ? `Group ${String.fromCharCode(65 + (i % 5))}` : null });
      await results.add(rec);
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }
    notify(`${n} practice results added. They are marked as practice and can be removed together.`);
  };

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Ship" title="Learners and results" actions={live ? <Button onClick={() => onPlay?.({ section: 'results' })}>Open the learner experience</Button> : null}>
        Run the simulation with cohorts, and see what learners did: how they scored, how well they reasoned, which ideas need reinforcing and how each decision went.
      </SectionHead>
      <div className="row small muted">
        <span>{results?.backend === 'shared' ? 'Results are shared with everyone this simulation is shared with. Reflections stay private to each learner.' : 'Results are stored in this browser. When the page runs on claude.ai with shared data, results from every learner collect here.'}</span>
      </div>

      <div className="tabs" role="tablist">
        {[['report', 'Group report'], ['cohorts', `Cohorts (${cohorts.length})`], ['learners', `Learners (${rows.length})`], ['board', 'Leaderboard'], ['lms', 'LMS scores']].map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab !== 'cohorts' && (
        <div className="row filters">
          <Field label="Version">
            <select className="select" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="all">All versions</option>
              {versions.map((v) => <option key={v} value={String(v)}>Version {v}</option>)}
            </select>
          </Field>
          <Field label="Cohort">
            <select className="select" value={cohort} onChange={(e) => setCohort(e.target.value)}>
              <option value="all">Everyone</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="none">Not in a cohort</option>
            </select>
          </Field>
          {practiceCount > 0 && (
            <label className="row nowrap small" style={{ '--gap': '6px', alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={showPractice} onChange={(e) => setShowPractice(e.target.checked)} /> Include {practiceCount} practice results</label>
          )}
        </div>
      )}

      {tab === 'report' && (rows.length ? <Report def={live?.def || def} rows={rows} /> : <Empty live={live} onPlay={onPlay} onPractice={addPractice} />)}
      {tab === 'cohorts' && <Cohorts def={def} update={update} sim={sim} all={all} notify={notify} />}
      {tab === 'learners' && <Learners def={def} sim={sim} rows={rows} results={results} notify={notify} practiceCount={practiceCount} onPractice={live ? addPractice : null} cohorts={cohorts} />}
      {tab === 'board' && (rows.length ? <div className="card"><Leaderboard rows={rows.filter((r) => r.completed !== false)} you={null} delivery={{ ...def.delivery, leaderboardSize: def.delivery.leaderboardSize || 10 }} />{!def.delivery.leaderboard && <p className="small muted">Learners do not see this: the leaderboard is off in Settings and delivery.</p>}</div> : <Empty live={live} onPlay={onPlay} onPractice={addPractice} />)}
      {tab === 'lms' && <LmsScores rows={rows} notify={notify} def={def} />}
    </div>
  );
}

function Empty({ live, onPlay, onPractice }) {
  return (
    <Callout icon="i">
      No results yet. {live ? 'Play it yourself as a learner, share the learner link with a cohort, or add practice learners to see what the report looks like.' : 'Publish the simulation first: learners always play the published version.'}{' '}
      {live && <><Button size="sm" onClick={() => onPlay?.({ section: 'results' })}>Play as a learner</Button>{' '}<Button size="sm" variant="ghost" onClick={() => onPractice()}>Add 24 practice learners</Button></>}
    </Callout>
  );
}

// ---------- group report ----------

function Report({ def, rows }) {
  const s = useMemo(() => summarise(rows, def), [rows, def]);
  const pass = def.delivery?.passScore ?? 65;
  const points = def.decisions?.points || [];
  const concepts = def.decisions?.concepts || {};
  const groups = [...new Set(rows.map((r) => r.group).filter(Boolean))];
  const tiers = TIERS.map((t) => ({ ...t, n: rows.filter((r) => r.tier === t.id).length }));
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="grid cols-4">
        <Tile label="Completed" value={s.n} />
        <Tile label="Average score" value={s.avgScore ?? 'n/a'} sub="out of 100" />
        <Tile label="Passed" value={s.passRate === null ? 'n/a' : `${s.passRate}%`} sub={`pass mark ${pass}`} />
        <Tile label="Average result" value={s.avgAchieved === null ? 'n/a' : `${Math.round(s.avgAchieved * 100)}%`} sub="of the target" />
      </div>

      <div className="card stack">
        <h3>Scores</h3>
        <Histogram bins={s.bins.map((b, i) => ({ ...b, label: `${b.label}${i === 9 ? '+' : ''}`, }))} valueLabel="learners" marker={pass / 10 - 0.5} markerLabel={`Pass ${pass}`} title="Learners by overall score" />
        <p className="small muted">{tiers.filter((t) => t.n).map((t) => `${t.n} ${t.label.toLowerCase()}`).join(', ')}.</p>
      </div>

      <div className="grid cols-2">
        <div className="card stack">
          <h3>Reasoning in written answers</h3>
          <p className="small muted">Average criterion scores across every open response.</p>
          {s.criteria.length ? <BarList rows={s.criteria.map((c) => ({ label: CRITERIA_LIBRARY[c.id]?.label || c.id, value: c.score, color: c.score >= 70 ? 'var(--series-3)' : c.score < 40 ? 'var(--series-2)' : 'var(--series-1)' }))} title="Reasoning criteria" /> : <p className="small muted">No written answers yet.</p>}
        </div>
        <div className="card stack">
          <h3>Concepts to reinforce</h3>
          <p className="small muted">Lowest first. Plan the follow-up session around the top of this list.</p>
          {s.concepts.length ? <BarList rows={s.concepts.map((c) => ({ label: concepts[c.id]?.label || c.id, value: c.score, color: c.score >= 70 ? 'var(--series-3)' : c.score < 40 ? 'var(--series-2)' : 'var(--series-1)' }))} title="Concept scores" /> : <p className="small muted">Not enough answers yet.</p>}
        </div>
      </div>

      <div className="card stack">
        <h3>Each decision</h3>
        <Legend items={[{ label: 'Strong', color: 'var(--good)' }, { label: 'Mixed', color: 'var(--warn)' }, { label: 'Weak', color: 'var(--bad)' }]} />
        <div className="dec-table" role="table" aria-label="Decision breakdown">
          {s.decisions.filter((x) => x.n).map((x) => {
            const p = points.find((q) => q.id === x.id);
            const top = Object.entries(x.counts).filter(([k]) => k !== 'text').sort((a, b) => b[1] - a[1])[0];
            const topText = top && p?.options?.find((o) => o.id === top[0])?.text;
            const total = x.bands.reduce((t, v) => t + v, 0) || 1;
            return (
              <div key={x.id} className="dec-row" role="row">
                <div role="cell" className="grow" style={{ minWidth: 0 }}>
                  <strong className="small">{p ? renderText(def, p.title, textVars(def, null, p)) : x.title}</strong>
                  <div className="small muted">W{p?.week} · {INTERACTION_TYPES[x.type]?.label} · {x.n} answered · average {x.avg}{topText ? ` · most chose "${renderText(def, topText, textVars(def, null, p)).slice(0, 70)}"` : ''}</div>
                </div>
                <div role="cell" className="band-bar" title={`${x.bands[0]} strong, ${x.bands[1]} mixed, ${x.bands[2]} weak`}>
                  {x.bands.map((v, i) => v > 0 && <span key={i} className={['strong', 'mixed', 'weak'][i]} style={{ width: `${(v / total) * 100}%` }} />)}
                </div>
              </div>
            );
          })}
        </div>
        {points.some((p) => !s.decisions.find((x) => x.id === p.id)?.n) && <p className="small muted">Moments on other paths (branches) or not reached yet show once someone answers them.</p>}
      </div>

      {groups.length > 0 && (
        <div className="card stack">
          <h3>Groups</h3>
          {groups.map((g) => {
            const gr = rows.filter((r) => r.group === g);
            const best = gr.sort((a, b) => b.score - a.score)[0];
            return <div key={g} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span><strong>{g}</strong> <span className="small muted">{(best.members || []).join(', ')}</span></span><span className="num">{best.score} <span className="small muted">{best.tier}</span></span></div>;
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return <div className="card tight stat-tile"><span className="small muted">{label}</span><strong className="num">{value}</strong>{sub && <span className="small muted">{sub}</span>}</div>;
}

// ---------- cohorts ----------

function Cohorts({ def, update, sim, all, notify }) {
  const cohorts = def.delivery.cohorts || [];
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const link = typeof location !== 'undefined' ? `${location.href.split('#')[0]}#/play/${sim.id}` : `#/play/${sim.id}`;
  const save = () => {
    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();
    if (!name) return setErr('Give the cohort a name.');
    if (!/^[A-Z0-9-]{4,12}$/.test(code)) return setErr('The code is 4 to 12 letters or numbers.');
    if (cohorts.some((c) => c.id !== draft.id && c.code.toUpperCase() === code)) return setErr('Another cohort uses that code.');
    if (draft.opens && draft.closes && draft.closes < draft.opens) return setErr('The closing date is before the opening date.');
    update((x) => {
      const list = x.delivery.cohorts || [];
      const rec = { ...draft, name, code };
      x.delivery.cohorts = draft.id && list.some((c) => c.id === draft.id) ? list.map((c) => (c.id === draft.id ? rec : c)) : [...list, { ...rec, id: `coh-${Date.now().toString(36)}`, createdAt: Date.now(), status: 'open' }];
    });
    notify(`${name} saved. Learners can use the code straight away.`);
    setDraft(null); setErr('');
  };
  return (
    <div className="stack" style={{ '--gap': '12px' }}>
      <p className="small muted">A cohort is a group of learners who play in the same window, such as one workshop. Learners enter the cohort code on the welcome screen; reports and the leaderboard can be filtered to the cohort. Cohort changes apply straight away, without publishing.</p>
      {cohorts.map((c) => {
        const n = all.filter((r) => r.cohortId === c.id).length;
        const open = isOpen(c);
        return (
          <div key={c.id} className="card tight row spread">
            <div>
              <div className="row"><strong>{c.name}</strong><Pill tone={open ? 'good' : ''}>{c.status === 'closed' ? 'Closed' : open ? 'Open' : c.opens && new Date(c.opens) > new Date() ? 'Not open yet' : 'Ended'}</Pill></div>
              <div className="small muted">Code <strong className="mono">{c.code}</strong>{c.opens ? ` · opens ${day(c.opens)}` : ''}{c.closes ? ` · closes ${day(c.closes)}` : ''} · {n} result{n === 1 ? '' : 's'}{c.facilitator ? ` · ${c.facilitator}` : ''}</div>
            </div>
            <div className="row">
              <Button size="sm" variant="ghost" onClick={async () => notify((await copyText(`${def.meta.name}\nOpen: ${link}\nCohort code: ${c.code}`)) ? 'Invitation copied' : 'Copy blocked')}>Copy invitation</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDraft({ ...c }); setErr(''); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => update((x) => { const k = x.delivery.cohorts.find((y) => y.id === c.id); k.status = k.status === 'closed' ? 'open' : 'closed'; })}>{c.status === 'closed' ? 'Reopen' : 'Close'}</Button>
            </div>
          </div>
        );
      })}
      {draft ? (
        <div className="card stack" style={{ '--gap': '10px' }}>
          <div className="grid cols-2">
            <TextInput label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Pune first-time managers, March" />
            <TextInput label="Code learners enter" value={draft.code} onChange={(v) => setDraft({ ...draft, code: v.toUpperCase() })} />
            <TextInput label="Opens" type="date" value={draft.opens || ''} onChange={(v) => setDraft({ ...draft, opens: v })} />
            <TextInput label="Closes" type="date" value={draft.closes || ''} onChange={(v) => setDraft({ ...draft, closes: v })} />
            <TextInput label="Facilitator" value={draft.facilitator || ''} onChange={(v) => setDraft({ ...draft, facilitator: v })} placeholder="Optional" />
          </div>
          {err && <p className="small" style={{ color: 'var(--bad)' }} role="alert">{err}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button onClick={() => { setDraft(null); setErr(''); }}>Cancel</Button><Button variant="primary" onClick={save}>Save cohort</Button></div>
        </div>
      ) : <div><Button onClick={() => setDraft({ name: '', code: code6(), opens: new Date().toISOString().slice(0, 10), closes: '', facilitator: '' })}>New cohort</Button></div>}
      <p className="small muted">Learner link: <span className="mono">{link}</span></p>
    </div>
  );
}

// ---------- learners ----------

const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function Learners({ def, sim, rows, results, notify, practiceCount, onPractice, cohorts }) {
  const [picked, setPicked] = useState([]);
  const [sort, setSort] = useState('recent');
  const cName = (id) => cohorts.find((c) => c.id === id)?.name || '';
  const sorted = [...rows].sort((a, b) => (sort === 'score' ? b.score - a.score : b.at - a.at));
  const pass = def.delivery.passScore ?? 65;
  const exportCsv = async () => {
    const head = ['name', 'nickname', 'group', 'cohort', 'version', 'finished', 'score', 'tier', 'passed', 'conversions', 'achieved_pct', 'results', 'leadership', 'decisions', 'recall', 'xp', 'achievements', 'language', 'lms_platform', 'practice'];
    const body = rows.map((r) => [r.name, r.nickname, r.group, cName(r.cohortId), r.version, new Date(r.at).toISOString(), r.score, r.tier, r.score >= pass ? 'yes' : 'no', r.conversions, Math.round((r.achieved || 0) * 100), r.parts?.results, r.parts?.leadership, r.parts?.decisions, r.parts?.recall, r.xp, (r.achievements || []).join(' '), r.language, r.lti?.platform || '', r.practice ? 'yes' : 'no']);
    const r = await downloadText(`${slug(def.meta.name)}-results.csv`, [head, ...body].map((x) => x.map(csv).join(',')).join('\n'));
    notify(r === 'saved' ? 'Results saved' : r === 'declined' ? 'Results not saved' : 'Downloads are not available here');
  };
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <Seg label="Sort" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Most recent' }, { value: 'score', label: 'Highest score' }]} />
        <div className="row">
          {onPractice && <Button size="sm" variant="ghost" onClick={() => onPractice()}>Add 24 practice learners</Button>}
          {practiceCount > 0 && <Button size="sm" variant="ghost" onClick={() => { results.remove(results.forSim(sim.id).filter((r) => r.practice).map((r) => r.id)); notify('Practice results removed'); }}>Remove practice results</Button>}
          <Button size="sm" disabled={!rows.length} onClick={exportCsv}>Export CSV</Button>
          {picked.length > 0 && <Button size="sm" className="danger" onClick={() => { results.remove(picked); setPicked([]); notify(`${picked.length} result${picked.length === 1 ? '' : 's'} deleted`); }}>Delete {picked.length}</Button>}
        </div>
      </div>
      {!rows.length ? <p className="small muted">No results match these filters.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th><span className="sr-only">Select</span></th><th>Learner</th><th>Cohort</th><th>Finished</th><th className="num">Score</th><th>Result</th><th className="num">Conversions</th><th>Achievements</th></tr></thead>
            <tbody>
              {sorted.slice(0, 200).map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} aria-label={`Select ${r.name}`} /></td>
                  <td><strong>{r.group || r.name || 'Anonymous'}</strong>{r.practice && r.group ? <span className="small muted"> (practice)</span> : null}{r.group && r.members?.length ? <div className="small muted">{r.members.join(', ')}</div> : null}{r.lti ? <div className="small muted">via {r.lti.platform}</div> : null}</td>
                  <td className="small">{cName(r.cohortId)}</td>
                  <td className="small">{day(r.at)}{r.version ? ` · v${r.version}` : ''}</td>
                  <td className="num"><strong>{r.score}</strong></td>
                  <td>{r.score >= pass ? <Pill tone="good">Passed</Pill> : <Pill tone="warn">Not yet</Pill>} <span className="small muted">{TIERS.find((t) => t.id === r.tier)?.label}</span></td>
                  <td className="num">{Number(r.conversions).toFixed(1)}</td>
                  <td className="small muted">{(r.achievements || []).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LmsScores({ rows, notify, def }) {
  const lms = rows.filter((r) => r.lti);
  if (!lms.length) return <Callout icon="i">No LMS launches yet. {def.delivery.lti ? 'Use Test a launch in Settings and delivery to rehearse one.' : 'Turn on LTI in Settings and delivery to launch from an LMS.'} SCORM packages report their scores to the LMS directly.</Callout>;
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      <p className="small muted">The Assignment and Grade Services score message for each LMS learner, as the LTI service posts it to the course gradebook line item.</p>
      {lms.map((r) => {
        const text = JSON.stringify(r.lti.score, null, 2);
        return (
          <div key={r.id} className="card tight stack" style={{ '--gap': '6px' }}>
            <div className="row spread"><span><strong>{r.name}</strong> <span className="small muted">{r.lti.platform} · {r.lti.context?.title} · {day(r.at)}</span></span><span className="num">{r.lti.score?.scoreGiven}/{r.lti.score?.scoreMaximum}</span></div>
            <details><summary className="small">Score message</summary><pre className="mono small code-block">{text}</pre><Button size="sm" variant="ghost" onClick={async () => notify((await copyText(text)) ? 'Copied' : 'Copy blocked')}>Copy</Button></details>
          </div>
        );
      })}
    </div>
  );
}
