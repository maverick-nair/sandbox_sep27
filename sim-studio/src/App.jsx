import { useCallback, useEffect, useState } from 'react';
import { useSims, readFlowDraft, clearFlowDraft, backupText, downloadText } from './studio/store.js';
import Home from './studio/Home.jsx';
import CreateFlow from './studio/CreateFlow.jsx';
import Studio from './studio/Studio.jsx';
import ErrorBoundary from './studio/ErrorBoundary.jsx';
import { Button, Toast } from './studio/ui.jsx';

export default function App() {
  const store = useSims();
  const [route, setRoute] = useState({ screen: 'home' });
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
            <Button size="sm" variant="primary" onClick={() => setToast(downloadText(`sim-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText(store.sims)) ? 'Backup downloaded' : 'Downloads are blocked here: copy the definition from Settings instead')}>Download a backup</Button>
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
          <Studio key={sim.id} sim={sim} store={store} initialSection={route.section} notify={setToast} onExit={home} />
        )}
      </ErrorBoundary>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
