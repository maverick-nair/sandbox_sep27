import { useCallback, useState } from 'react';
import { useSims } from './studio/store.js';
import Home from './studio/Home.jsx';
import Wizard from './studio/Wizard.jsx';
import Studio from './studio/Studio.jsx';
import { Toast } from './studio/ui.jsx';

export default function App() {
  const store = useSims();
  const [route, setRoute] = useState({ screen: 'home' });
  const [toast, setToast] = useState('');
  const clearToast = useCallback(() => setToast(''), []);
  const sim = route.simId ? store.sims.find((s) => s.id === route.simId) : null;

  const crumbs = [
    { label: 'Experience', go: () => setRoute({ screen: 'home' }) },
    { label: 'Simulations', go: () => setRoute({ screen: 'home' }) },
  ];
  if (route.screen === 'wizard') crumbs.push({ label: 'New simulation' });
  if (route.screen === 'studio' && sim) crumbs.push({ label: sim.def.meta.name });

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
      {route.screen === 'home' && (
        <Home
          store={store}
          onOpen={(id) => setRoute({ screen: 'studio', simId: id })}
          onNew={(templateId) => setRoute({ screen: 'wizard', templateId })}
          notify={setToast}
        />
      )}
      {route.screen === 'wizard' && (
        <Wizard
          templateId={route.templateId || 'ilead'}
          onCancel={() => setRoute({ screen: 'home' })}
          onCreate={(def, section) => {
            const id = store.create(def);
            setRoute({ screen: 'studio', simId: id, section });
            setToast('Draft created');
          }}
        />
      )}
      {route.screen === 'studio' && sim && (
        <Studio key={sim.id} sim={sim} store={store} initialSection={route.section} notify={setToast} onExit={() => setRoute({ screen: 'home' })} />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
