import React from 'react';
import { WorkspaceProvider, useWorkspace } from './engine/WorkspaceContext.jsx';
import Shell from './components/Shell.jsx';
import { Toasts } from './components/ui.jsx';
import Home from './screens/Home.jsx';
import Settings from './screens/Settings.jsx';
import Author from './screens/Author.jsx';
import Help from './screens/Help.jsx';

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div className="mx-auto max-w-xl p-8"><div className="card p-6"><h2 className="text-base font-semibold">Something went wrong</h2><p className="muted mt-2 text-sm">{String(this.state.error?.message || this.state.error)}</p><p className="muted mt-2 text-sm">Your work is autosaved. Reload the page to continue, or export the workspace from Settings.</p><button className="mt-4 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm text-white" onClick={() => window.location.reload()}>Reload</button></div></div>;
    return this.props.children;
  }
}

function Router() {
  const { route, current, toasts, loading } = useWorkspace();
  if (loading) return <div className="flex h-full items-center justify-center"><div className="pulse text-sm muted">Opening your workspace</div></div>;
  let page;
  if (route === 'settings') page = <Shell title="Settings" subtitle="AI connection, workspace, audit log and AI call log."><Settings /></Shell>;
  else if (route === 'help') page = <Shell title="Help and support"><Help /></Shell>;
  else if ((route === 'author' || route === 'calibration') && current) page = <Author />;
  else page = <Shell><Home /></Shell>;
  return <>{page}<Toasts toasts={toasts} /></>;
}

export default function App() { return <Boundary><WorkspaceProvider><Router /></WorkspaceProvider></Boundary>; }
