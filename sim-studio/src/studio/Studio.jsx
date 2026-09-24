import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validate, healthSummary } from '../engine/validate.js';
import { Button, Drawer, Modal, Pill, Switch, TextInput, Callout, Tip, copyText } from './ui.jsx';
import Overview from './sections/Overview.jsx';
import Story from './sections/Story.jsx';
import Funnel from './sections/Funnel.jsx';
import Team from './sections/Team.jsx';
import Leadership from './sections/Leadership.jsx';
import Actions from './sections/Actions.jsx';
import Events from './sections/Events.jsx';
import Decisions from './sections/Decisions.jsx';
import Results from './sections/Results.jsx';
import Report from './sections/Report.jsx';
import Settings from './sections/Settings.jsx';
import Balance from './Balance.jsx';
import Player from '../learner/Player.jsx';
import HealthDrawer from './Health.jsx';
import { TEMPLATES } from '../templates/registry.js';
import { mixOf } from '../engine/decisions.js';
import { ScormCard, translationStatus, LANGUAGES } from './Delivery.jsx';

// What each main action does, shown as tooltips.
export const TIPS = {
  health: 'Checks every rule the simulation depends on, on every change: missing copy, stages without people, events outside the calendar. Lists what to fix before publishing.',
  balance: 'Four bot leaders play the simulation many times. Shows whether a skilled leader can reach the target and whether guessing cannot, and suggests a fair target.',
  play: "Play the simulation as a learner would, from the welcome letter to the report. Author x-ray shows each person's true skill and morale.",
  publish: 'Saves a numbered version that learners get from now on. Runs already in progress keep their version. Blocked while the health check has errors.',
  engine: 'Reveals the numbers behind the plain controls: impacts, probabilities, formulas and buffers. Off keeps the Studio simple.',
  all: 'Back to your list of simulations. Your work is saved automatically.',
  undo: 'Undoes your last change in this session (Ctrl+Z or Cmd+Z outside a text box). Redo with Ctrl+Shift+Z.',
};

const SAVE_LABEL = { saved: 'Saved in this browser', saving: 'Saving…', error: 'Not saved' };

export const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Plan', component: Overview },
  { id: 'story', label: 'Story and context', group: 'Build', component: Story },
  { id: 'funnel', label: 'Funnel and target', group: 'Build', component: Funnel },
  { id: 'team', label: 'Team', group: 'Build', component: Team },
  { id: 'leadership', label: 'Leadership model', group: 'Build', component: Leadership },
  { id: 'actions', label: 'Actions', group: 'Build', component: Actions },
  { id: 'events', label: 'Events', group: 'Build', component: Events },
  { id: 'decisions', label: 'Decision moments', group: 'Build', component: Decisions },
  { id: 'report', label: 'Report', group: 'Build', component: Report },
  { id: 'settings', label: 'Settings and delivery', group: 'Ship', component: Settings },
  { id: 'results', label: 'Learners and results', group: 'Ship', component: Results },
];

export default function Studio({ sim, store, results, initialSection, notify, onExit, onPlay }) {
  const [section, setSection] = useState(initialSection || 'overview');
  const [focus, setFocus] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [panel, setPanel] = useState(null); // 'health' | 'balance' | 'publish' | 'preview'
  const def = sim.def;
  // Session undo: every change records the definition before it. Rapid edits to the same
  // field (typing) collapse into one step.
  const history = useRef({ past: [], future: [], at: 0 });
  const [, bump] = useState(0);
  const current = useRef(def);
  current.current = def;
  const update = useCallback((mutator) => {
    const h = history.current;
    const now = Date.now();
    if (now - h.at > 700 || !h.past.length) h.past.push(current.current);
    if (h.past.length > 50) h.past.shift();
    h.future = [];
    h.at = now;
    bump((n) => n + 1);
    store.update(sim.id, mutator);
  }, [store, sim.id]);
  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(current.current);
    store.replace(sim.id, h.past.pop());
    h.at = 0;
    bump((n) => n + 1);
    notify('Undone');
  }, [store, sim.id, notify]);
  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(current.current);
    store.replace(sim.id, h.future.pop());
    h.at = 0;
    bump((n) => n + 1);
    notify('Redone');
  }, [store, sim.id, notify]);
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return; // the text box's own undo
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  const issues = useMemo(() => validate(def), [def]);
  const health = healthSummary(issues);
  const balanceStale = sim.balance && sim.balance.at < sim.updatedAt;

  const go = (sec, ref = null) => {
    setSection(sec);
    setFocus(ref);
    setPanel(null);
    document.querySelector('.main')?.scrollTo({ top: 0 });
  };

  const Current = SECTIONS.find((s) => s.id === section).component;
  const bySection = (id) => issues.filter((i) => i.section === id && i.severity !== 'info');
  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  const ctx = { def, update, advanced, sim, store, results, notify, go, focus, issues, openPanel: setPanel, onPlay };

  return (
    <div className="shell compact-rail">
      <nav className="rail" aria-label="Studio sections">
        {groups.map((g) => (
          <div className="rail-group" key={g}>
            <span className="eyebrow">{g}</span>
            {SECTIONS.filter((s) => s.group === g).map((s) => {
              const own = bySection(s.id);
              const errs = own.filter((i) => i.severity === 'error').length;
              return (
                <button key={s.id} type="button" className={`rail-item ${section === s.id ? 'active' : ''}`} onClick={() => go(s.id)} aria-current={section === s.id ? 'page' : undefined}>
                  {s.label}
                  {own.length > 0 && <span className={`badge ${errs ? 'bad' : 'warn'}`} title={`${errs} to fix, ${own.length - errs} to review`}>{own.length}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="rail-group">
          <span className="eyebrow">Test</span>
          <Tip text={TIPS.balance} align="right">
            <button type="button" className="rail-item" onClick={() => setPanel('balance')}>
              Balance check
              {sim.balance ? <span className={`badge ${sim.balance.status === 'balanced' && !balanceStale ? '' : 'warn'}`}>{balanceStale ? '!' : sim.balance.status === 'balanced' ? '✓' : '!'}</span> : null}
            </button>
          </Tip>
          <Tip text={TIPS.play} align="right">
            <button type="button" className="rail-item" onClick={() => setPanel('preview')}>Play as learner</button>
          </Tip>
        </div>
      </nav>
      <div className="mobile-nav">
        <label className="sr-only" htmlFor="studio-section">Section</label>
        <select id="studio-section" className="select" value={section} onChange={(e) => go(e.target.value)}>
          {SECTIONS.map((s) => { const n = bySection(s.id).length; return <option key={s.id} value={s.id}>{s.label}{n ? ` (${n} to review)` : ''}</option>; })}
        </select>
      </div>
      <main className="main">
        <div className="page" style={{ paddingTop: 16 }}>
          <div className="row spread" style={{ marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ minWidth: 0 }}>
              <Button variant="ghost" size="sm" onClick={onExit} tip={TIPS.all} tipAlign="start">All simulations</Button>
              {sim.status === 'published' ? <Pill tone="accent">Published v{sim.versions.at(-1)?.version}{sim.updatedAt > (sim.publishedAt || sim.versions.at(-1)?.at || 0) ? ' · unpublished changes' : ''}</Pill> : <Pill>Draft</Pill>}
              <span className={`save-state ${store.save.state === 'error' ? 'error' : ''}`} role="status" aria-live="polite">{SAVE_LABEL[store.save.state]}</span>
              {history.current.past.length > 0 && <Button size="sm" variant="ghost" onClick={undo} tip={TIPS.undo} tipAlign="start">Undo</Button>}
            </div>
            <div className="row">
              <Tip text={TIPS.engine}><Switch checked={advanced} onChange={setAdvanced} label="Show engine settings" /></Tip>
              <Button size="sm" onClick={() => setPanel('health')} tip={TIPS.health}>
                {health.errors ? <span className="badge bad">{health.errors}</span> : null}
                {health.warnings ? <span className="badge warn">{health.warnings}</span> : null}
                Health check
              </Button>
              <Button size="sm" onClick={() => setPanel('balance')} tip={TIPS.balance}>Balance check</Button>
              <Button size="sm" onClick={() => setPanel('preview')} tip={TIPS.play}>Play as learner</Button>
              <Button size="sm" variant="primary" onClick={() => setPanel('publish')} tip={TIPS.publish} tipAlign="end">Publish</Button>
            </div>
          </div>
          <Current {...ctx} />
        </div>
      </main>

      {panel === 'health' && <HealthDrawer def={def} issues={issues} onClose={() => setPanel(null)} go={go} update={update} notify={notify} />}
      {panel === 'balance' && <Balance sim={sim} def={def} store={store} update={update} onClose={() => setPanel(null)} notify={notify} advanced={advanced} />}
      {panel === 'publish' && <PublishModal sim={sim} health={health} store={store} onClose={() => setPanel(null)} notify={notify} openHealth={() => setPanel('health')} openBalance={() => setPanel('balance')} update={update} onPlay={onPlay} go={go} />}
      {panel === 'preview' && <Player def={def} mode="preview" delivery={def.delivery} benchmark={sim.balance?.synthetic?.scores || []} onExit={() => setPanel(null)} />}
    </div>
  );
}

function PublishModal({ sim, health, store, onClose, notify, openHealth, openBalance, update, onPlay, go }) {
  const [note, setNote] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [done, setDone] = useState(null);
  const def = sim.def;
  const next = (sim.versions.at(-1)?.version || 0) + 1;
  const balanced = sim.balance && sim.balance.at >= sim.updatedAt;
  const m = mixOf(def.decisions?.points || []);
  const target = def.decisions?.mix?.open ?? 30;
  const mixPct = m.total ? Math.round((m.open / m.total) * 100) : 0;
  const langs = (def.delivery.languages || []).filter((l) => l !== 'en').map((l) => ({ l, ...translationStatus(def, l) }));
  const d = def.delivery;
  const openCohorts = (d.cohorts || []).filter((c) => c.status !== 'closed').length;
  const link = `${location.href.split('#')[0]}#/play/${sim.id}`;
  const fixAll = () => {
    const r = TEMPLATES[def.meta.templateId].fixes.applyAllSuggested(def, validate, ['error']);
    update(() => r.def);
    notify(r.left.length ? `${r.left.length} still need you. Open the health check to see them.` : 'Fixed with the suggestions. Undo is at the top.');
  };
  const checks = [
    { id: 'health', ok: health.errors === 0, blocking: true, title: health.errors ? `${health.errors} issue${health.errors === 1 ? '' : 's'} must be fixed` : 'No blocking issues', detail: health.errors ? 'Each has a suggested fix you can use as it is.' : health.warnings ? `${health.warnings} suggestion${health.warnings === 1 ? '' : 's'} worth a look, but nothing blocks publishing.` : 'Every rule the simulation depends on passes.', actions: health.errors ? <>{TEMPLATES[def.meta.templateId]?.fixes && <Button size="sm" variant="primary" onClick={fixAll}>Fix with the suggestions</Button>}<Button size="sm" onClick={openHealth}>Review each fix</Button></> : health.warnings ? <Button size="sm" variant="ghost" onClick={openHealth}>Review</Button> : null },
    { id: 'balance', ok: !!balanced && sim.balance.status === 'balanced', title: balanced ? (sim.balance.status === 'balanced' ? 'Balance check passed on this version' : 'The balance check found the target unfair') : 'The balance check has not been run on this version', detail: balanced ? `A skilled leader reaches ${Math.round((sim.balance.bots?.expert?.p50 ?? 0) * 100)}% of the target; guessing reaches ${Math.round((sim.balance.bots?.random?.p50 ?? 0) * 100)}%.` : 'Bots and practice learners play it so you know the target is fair and the scores spread sensibly.', actions: <Button size="sm" onClick={openBalance}>{balanced ? 'Open' : 'Run it now'}</Button> },
    { id: 'mix', ok: Math.abs(mixPct - target) <= 12, title: `Interaction mix: ${100 - mixPct}% structured, ${mixPct}% open`, detail: `${m.total} decision moments. Target ${100 - target}:${target}.`, actions: <Button size="sm" variant="ghost" onClick={() => go('decisions')}>Adjust</Button> },
    ...langs.map((x) => ({ id: `lang-${x.l}`, ok: x.done === x.total, title: `${LANGUAGES[x.l]}: ${x.done} of ${x.total} texts translated`, detail: x.done === x.total ? `${x.reviewed} reviewed.` : 'Learners who pick it see English for anything not translated.', actions: <Button size="sm" variant="ghost" onClick={() => go('settings')}>Translate</Button> })),
  ];
  const summary = [
    d.individual !== false && 'individual play',
    d.group && `group play (${d.groupSize?.min ?? 2} to ${d.groupSize?.max ?? 5})`,
    d.leaderboard && 'leaderboard',
    d.lti && `LTI (${(d.ltiPlatforms || []).length} platform${(d.ltiPlatforms || []).length === 1 ? '' : 's'})`,
    d.scorm && 'SCORM package',
    openCohorts && `${openCohorts} open cohort${openCohorts === 1 ? '' : 's'}`,
    `pass mark ${d.passScore ?? 65}`,
  ].filter(Boolean);

  if (done) {
    return (
      <Modal title={`Version ${done} is live`} onClose={onClose} wide>
        <div className="stack" style={{ '--gap': '14px' }}>
          <Callout tone="good" icon="✓">New learners get version {done} from now on. Anyone already playing finishes the version they started.</Callout>
          <div className="golive-grid">
            <div className="card tight stack" style={{ '--gap': '6px' }}><strong>Play it as a learner</strong><p className="small muted">The full experience, from the welcome to the debrief. Your result appears in Learners and results.</p><div><Button variant="primary" size="sm" onClick={() => { onClose(); onPlay?.({ section: 'results' }); }}>Open the learner experience</Button></div></div>
            <div className="card tight stack" style={{ '--gap': '6px' }}><strong>Share the learner link</strong><p className="small muted mono" style={{ wordBreak: 'break-all' }}>{link}</p><div><Button size="sm" onClick={async () => notify((await copyText(link)) ? 'Learner link copied' : 'Copy blocked')}>Copy link</Button></div></div>
            <div className="card tight stack" style={{ '--gap': '6px' }}><strong>Run it with a cohort</strong><p className="small muted">A code learners enter, dates, and a report for just that group.</p><div><Button size="sm" onClick={() => go('results', { tab: 'cohorts' })}>Set up a cohort</Button></div></div>
            {d.lti && <div className="card tight stack" style={{ '--gap': '6px' }}><strong>Add it to your LMS</strong><p className="small muted">Copy the LTI tool configuration for the LMS administrator, or test a launch.</p><div><Button size="sm" onClick={() => go('settings')}>LTI settings</Button></div></div>}
          </div>
          {d.scorm && <ScormCard sim={sim} def={def} update={update} notify={notify} live={[...sim.versions].reverse().find((v) => v.def)} />}
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Publish version ${next}`} onClose={onClose} wide>
      <div className="stack">
        <p className="small ink2">Publishing turns everything you built into the learner experience: the story, the team, every decision moment with its scoring, branching and consequences, and the debrief.</p>
        <ul className="golive-checks">
          {checks.map((c) => (
            <li key={c.id} className={c.ok ? 'ok' : c.blocking ? 'bad' : 'warn'}>
              <span className="golive-icon" aria-hidden="true">{c.ok ? '✓' : '!'}</span>
              <div className="grow"><strong>{c.title}</strong><div className="small muted">{c.detail}</div></div>
              {c.actions && <div className="row nowrap">{c.actions}</div>}
            </li>
          ))}
          <li className="ok">
            <span className="golive-icon" aria-hidden="true">i</span>
            <div className="grow"><strong>Delivery</strong><div className="small muted">{summary.join(', ')}.</div></div>
            <Button size="sm" variant="ghost" onClick={() => go('settings')}>Change</Button>
          </li>
        </ul>
        <TextInput label="What changed" placeholder="e.g. Re-skinned for Meridian Bank, 60-minute cut" value={note} onChange={setNote} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={health.errors > 0} onClick={() => { store.publish(sim.id, note || `Version ${next}`); notify(`Published version ${next}`); setDone(next); }}>Publish version {next}</Button>
        </div>
        {sim.versions.length > 0 && (
          <div className="stack" style={{ '--gap': '6px', marginTop: 8 }}>
            <h3>Version history</h3>
            {[...sim.versions].reverse().map((v) => (
              <div key={v.version} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <strong>v{v.version}</strong> <span className="small ink2">{v.note}</span>
                  <div className="small muted">{new Date(v.at).toLocaleString()}{v.trimmed ? ' · summary only' : ''}</div>
                </div>
                {v.trimmed ? null : confirmRestore === v.version ? (
                  <div className="row">
                    <span className="small">Replace the current draft?</span>
                    <Button size="sm" onClick={() => setConfirmRestore(null)}>No</Button>
                    <Button size="sm" variant="primary" onClick={() => { store.restore(sim.id, v.version); notify(`Draft restored from v${v.version}`); onClose(); }}>Restore</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(v.version)} tip="Replaces your current draft with this published version. Published versions are not changed." tipAlign="end">Restore to draft</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
