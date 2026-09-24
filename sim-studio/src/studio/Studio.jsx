import { useCallback, useMemo, useState } from 'react';
import { validate, healthSummary } from '../engine/validate.js';
import { Button, Drawer, Modal, Pill, Switch, TextInput, Callout, Tip } from './ui.jsx';
import Overview from './sections/Overview.jsx';
import Story from './sections/Story.jsx';
import Funnel from './sections/Funnel.jsx';
import Team from './sections/Team.jsx';
import Leadership from './sections/Leadership.jsx';
import Actions from './sections/Actions.jsx';
import Events from './sections/Events.jsx';
import Report from './sections/Report.jsx';
import Settings from './sections/Settings.jsx';
import Balance from './Balance.jsx';
import Preview from './Preview.jsx';

// What each main action does, shown as tooltips.
export const TIPS = {
  health: 'Checks every rule the simulation depends on, on every change: missing copy, stages without people, events outside the calendar. Lists what to fix before publishing.',
  balance: 'Four bot leaders play the simulation many times. Shows whether a skilled leader can reach the target and whether guessing cannot, and suggests a fair target.',
  play: "Play the simulation as a learner would, from the welcome letter to the report. Author x-ray shows each person's true skill and morale.",
  publish: 'Saves a numbered version that learners get from now on. Runs already in progress keep their version. Blocked while the health check has errors.',
  engine: 'Reveals the numbers behind the plain controls: impacts, probabilities, formulas and buffers. Off keeps the Studio simple.',
  all: 'Back to your list of simulations. Your work is saved automatically.',
};

export const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Plan', component: Overview },
  { id: 'story', label: 'Story and context', group: 'Build', component: Story },
  { id: 'funnel', label: 'Funnel and target', group: 'Build', component: Funnel },
  { id: 'team', label: 'Team', group: 'Build', component: Team },
  { id: 'leadership', label: 'Leadership model', group: 'Build', component: Leadership },
  { id: 'actions', label: 'Actions', group: 'Build', component: Actions },
  { id: 'events', label: 'Events', group: 'Build', component: Events },
  { id: 'report', label: 'Report', group: 'Build', component: Report },
  { id: 'settings', label: 'Settings and delivery', group: 'Ship', component: Settings },
];

export default function Studio({ sim, store, initialSection, notify, onExit }) {
  const [section, setSection] = useState(initialSection || 'overview');
  const [focus, setFocus] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [panel, setPanel] = useState(null); // 'health' | 'balance' | 'publish' | 'preview'
  const def = sim.def;
  const update = useCallback((mutator) => store.update(sim.id, mutator), [store, sim.id]);
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

  const ctx = { def, update, advanced, sim, store, notify, go, focus, issues, openPanel: setPanel };

  return (
    <div className="shell">
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
      <main className="main">
        <div className="page" style={{ paddingTop: 16 }}>
          <div className="row spread" style={{ marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ minWidth: 0 }}>
              <Button variant="ghost" size="sm" onClick={onExit} tip={TIPS.all} tipAlign="start">All simulations</Button>
              {sim.status === 'published' ? <Pill tone="accent">Published v{sim.versions.at(-1)?.version}{sim.updatedAt > (sim.publishedAt || sim.versions.at(-1)?.at || 0) ? ' · unpublished changes' : ''}</Pill> : <Pill>Draft</Pill>}
              <span className="small muted">Saved in this browser</span>
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

      {panel === 'health' && <HealthDrawer issues={issues} onClose={() => setPanel(null)} go={go} update={update} notify={notify} />}
      {panel === 'balance' && <Balance sim={sim} def={def} store={store} update={update} onClose={() => setPanel(null)} notify={notify} advanced={advanced} />}
      {panel === 'publish' && <PublishModal sim={sim} health={health} store={store} onClose={() => setPanel(null)} notify={notify} openHealth={() => setPanel('health')} />}
      {panel === 'preview' && <Preview def={def} onClose={() => setPanel(null)} />}
    </div>
  );
}

function HealthDrawer({ issues, onClose, go, update, notify }) {
  const tones = { error: 'bad', warning: 'warn', info: '' };
  const labels = { error: 'Fix before publishing', warning: 'Review', info: 'For information' };
  return (
    <Drawer title="Health check" subtitle="Runs on every change" onClose={onClose}>
      {issues.length === 0 && <Callout tone="good" icon="✓">No issues. Run the balance check before you publish.</Callout>}
      <div className="stack" style={{ '--gap': '18px' }}>
        {['error', 'warning', 'info'].map((sev) => {
          const list = issues.filter((i) => i.severity === sev);
          if (!list.length) return null;
          return (
            <div key={sev} className="stack" style={{ '--gap': '8px' }}>
              <div className="row"><Pill tone={tones[sev]}>{list.length}</Pill><h3>{labels[sev]}</h3></div>
              {list.map((i) => (
                <div key={i.id} className="card tight stack" style={{ '--gap': '6px' }}>
                  <div className="row spread nowrap">
                    <strong>{i.title}</strong>
                    <span className="small muted" style={{ textTransform: 'capitalize' }}>{i.section}</span>
                  </div>
                  <p className="small ink2">{i.detail}</p>
                  <div className="row">
                    <Button size="sm" onClick={() => go(i.section, i.ref)}>Go to {i.section}</Button>
                    {i.fix && <Button size="sm" variant="primary" onClick={() => { update(i.fix.patch); notify('Fixed'); }} tip="Applies the suggested change for you. You can change it again later.">{i.fix.label}</Button>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

function PublishModal({ sim, health, store, onClose, notify, openHealth }) {
  const [note, setNote] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(null);
  const next = (sim.versions.at(-1)?.version || 0) + 1;
  const balanced = sim.balance && sim.balance.at >= sim.updatedAt;
  return (
    <Modal title={`Publish version ${next}`} onClose={onClose}>
      <div className="stack">
        {health.errors > 0 ? (
          <Callout tone="bad" icon="!">
            {health.errors} issue{health.errors === 1 ? '' : 's'} must be fixed first. <Button size="sm" onClick={openHealth}>Open health check</Button>
          </Callout>
        ) : (
          <Callout tone="good" icon="✓">No blocking issues.</Callout>
        )}
        {!balanced && <Callout tone="warn" icon="!">The balance check has not been run on this version. You can publish, but you will not know whether the target is fair.</Callout>}
        <TextInput label="What changed" placeholder="e.g. Re-skinned for Meridian Bank, 60-minute cut" value={note} onChange={setNote} />
        <p className="small muted">Learners already in a run keep the version they started. New runs get this version. Delivery (individual, group, LTI, SCORM) is set in Settings and delivery.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={health.errors > 0} onClick={() => { store.publish(sim.id, note || `Version ${next}`); notify(`Published version ${next}`); onClose(); }}>Publish version {next}</Button>
        </div>
        {sim.versions.length > 0 && (
          <div className="stack" style={{ '--gap': '6px', marginTop: 8 }}>
            <h3>Version history</h3>
            {[...sim.versions].reverse().map((v) => (
              <div key={v.version} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <strong>v{v.version}</strong> <span className="small ink2">{v.note}</span>
                  <div className="small muted">{new Date(v.at).toLocaleString()}</div>
                </div>
                {confirmRestore === v.version ? (
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
