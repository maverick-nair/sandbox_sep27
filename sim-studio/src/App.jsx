import { useCallback, useEffect, useState } from 'react';
import { useSims, readFlowDraft, clearFlowDraft, backupText, downloadText } from './studio/store.js';
import Home from './studio/Home.jsx';
import CreateFlow from './studio/CreateFlow.jsx';
import Studio from './studio/Studio.jsx';
import ErrorBoundary from './studio/ErrorBoundary.jsx';
import { Button, Toast } from './studio/ui.jsx';
import Player from './learner/Player.jsx';
import { useResults } from './studio/results.js';
import { agsScore } from './delivery/lti.js';

// The version learners get: the newest published version that still has its full definition.
export function liveVersion(sim) {
  const v = [...(sim?.versions || [])].reverse().find((x) => x.def);
  return v ? { def: v.def, version: v.version } : null;
}
const hashRoute = () => {
  const m = /^#\/play\/([\w-]+)/.exec(typeof location !== 'undefined' ? location.hash : '');
  return m ? { screen: 'play', simId: m[1] } : { screen: 'home' };
};

export default function App() {
  const store = useSims();
  const results = useResults();
  const [route, setRoute] = useState(hashRoute);
  const [toast, setToast] = useState('');
  const [flowDraft, setFlowDraft] = useState(() => readFlowDraft());
  const clearToast = useCallback(() => setToast(''), []);
  const sim = route.simId ? store.sims.find((s) => s.id === route.simId) : null;

  useEffect(() => {
    if (store.synced) { setToast(store.synced); store.clearSynced(); }
  }, [store.synced, store]);

  const home = useCallback(() => {
    // Leaving the creation flow keeps its autosaved draft; say where to find it.
    if (route.screen === 'wizard') {
      const d = readFlowDraft();
      setFlowDraft(d);
      if (d) setToast('Your draft is saved. Resume it from Simulations.');
    }
    setRoute({ screen: 'home' });
  }, [route.screen]);

  const crumbs = [
    { label: 'Experience', go: home },
    { label: 'Simulations', go: home },
  ];
  if (route.screen === 'wizard') crumbs.push({ label: 'New simulation' });
  if (route.screen === 'play' && sim) crumbs.push({ label: `Play: ${sim.def.meta.name}` });
  if (route.screen === 'studio' && sim) crumbs.push({ label: sim.def.meta.name });

  const failed = store.save.state === 'error';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GenieKreator</span>
        </div>
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="row nowrap" style={{ '--gap': '6px', minWidth: 0 }}>
              <span className="sep">/</span>
              {c.go && i < crumbs.length - 1 ? <button type="button" onClick={c.go}>{c.label}</button> : <span className="here">{c.label}</span>}
            </span>
          ))}
        </nav>
      </header>
      {failed && (
        <div className="save-banner" role="alert">
          <span><strong>Not saved.</strong> {store.save.error} Your latest changes exist only in this tab until saving works again.</span>
          <span className="row nowrap">
            <Button size="sm" onClick={store.retrySave}>Try again</Button>
            <Button size="sm" variant="primary" onClick={async () => { const r = await downloadText(`sim-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText(store.sims)); setToast(r === 'saved' ? 'Backup saved' : r === 'declined' ? 'Backup not saved' : 'Downloads are not available here: copy the definition from Settings instead'); }}>Download a backup</Button>
          </span>
        </div>
      )}
      <ErrorBoundary key={route.screen + (route.simId || '')} onReset={() => setRoute({ screen: 'home' })}>
        {route.screen === 'home' && (
          <Home
            store={store}
            flowDraft={flowDraft}
            onResume={() => setRoute({ screen: 'wizard', templateId: flowDraft?.templateId || 'ilead', resume: flowDraft })}
            onDiscardDraft={() => { clearFlowDraft(); setFlowDraft(null); setToast('Draft discarded'); }}
            onOpen={(id) => setRoute({ screen: 'studio', simId: id })}
            onPlay={(id) => setRoute({ screen: 'play', simId: id })}
            results={results}
            onNew={(templateId) => { clearFlowDraft(); setFlowDraft(null); setRoute({ screen: 'wizard', templateId }); }}
            notify={setToast}
          />
        )}
        {route.screen === 'wizard' && (
          <CreateFlow
            templateId={route.templateId || 'ilead'}
            resume={route.resume}
            onCancel={home}
            onCreate={(def, section, balance, brief) => {
              const id = store.create(def, { brief, ...(balance ? { balance } : {}) });
              clearFlowDraft();
              setFlowDraft(null);
              setRoute({ screen: 'studio', simId: id, section });
              setToast('Draft created');
            }}
          />
        )}
        {route.screen === 'studio' && sim && (
          <Studio key={sim.id} sim={sim} store={store} results={results} initialSection={route.section} notify={setToast} onExit={home} onPlay={(opts = {}) => setRoute({ screen: 'play', simId: sim.id, back: { screen: 'studio', simId: sim.id, section: opts.section || 'results' }, ...opts })} />
        )}
        {route.screen === 'play' && <LearnerRoute sim={sim} route={route} results={results} onExit={() => { if (location.hash) history.replaceState(null, '', location.pathname + location.search); setRoute(route.back || { screen: 'home' }); }} notify={setToast} />}
      </ErrorBoundary>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function LearnerRoute({ sim, route, results, onExit, notify }) {
  const live = liveVersion(sim);
  if (!sim || !live) {
    return (
      <div className="page stack" style={{ maxWidth: 560, margin: '60px auto' }}>
        <h1>This simulation is not live yet</h1>
        <p className="ink2">{sim ? 'Publish it from the Studio first. Learners always get the latest published version.' : 'The link points to a simulation that is not in this workspace.'}</p>
        <div><Button onClick={onExit}>Back</Button></div>
      </div>
    );
  }
  const rows = results.forSim(sim.id).filter((r) => r.version === live.version || !r.version);
  return (
    <Player
      key={`${sim.id}:${live.version}:${route.lti?.resourceLinkId || ''}`}
      def={live.def}
      mode="live"
      saveKey={`gk-play-${sim.id}-v${live.version}${route.lti ? `-${route.lti.userId}` : ''}`}
      delivery={{ ...live.def.delivery, cohorts: sim.def.delivery?.cohorts || live.def.delivery.cohorts || [] }}
      benchmark={sim.balance?.synthetic?.scores || []}
      leaderboard={rows}
      identityDefaults={route.lti ? { name: route.lti.name, lti: route.lti } : {}}
      onExit={onExit}
      onFinish={(rec) => {
        const full = { ...rec, simId: sim.id, version: live.version, ...(route.lti ? { lti: { ...route.lti, score: agsScore(rec, route.lti) } } : {}) };
        results.add(full);
        notify(route.lti ? `Result saved. The score for ${route.lti.platform}'s gradebook is ready in Learners and results.` : 'Result saved');
      }}
    />
  );
}
