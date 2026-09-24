import { Component } from 'react';
import { backupText, downloadText } from './store.js';

// Catches anything that would otherwise leave a blank screen. The author's work is already in
// the browser's storage; this screen says so and offers a way back and a copy of everything.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, saved: '' };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Production sends this to error reporting with the simulation id, never the content.
    console.error('Sim Studio error', error, info?.componentStack);
  }

  render() {
    const { error, saved } = this.state;
    if (!error) return this.props.children;
    const backup = () => this.setState({ saved: downloadText(`sim-studio-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText()) ? 'A backup file was downloaded.' : 'Downloads are blocked here. Your work is still saved in this browser.' });
    return (
      <div className="page stack" role="alert" style={{ maxWidth: 640, margin: '60px auto', '--gap': '14px' }}>
        <div className="eyebrow">Something went wrong</div>
        <h1>This screen could not be shown</h1>
        <p className="ink2">Your simulations are saved in this browser up to your last change. Go back to your list, or reload the page. If this keeps happening, download a backup first.</p>
        <p className="small muted mono" style={{ wordBreak: 'break-word' }}>{String(error?.message || error)}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => { this.setState({ error: null, saved: '' }); this.props.onReset?.(); }}>Back to all simulations</button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
          <button type="button" className="btn ghost" onClick={backup}>Download a backup</button>
        </div>
        {saved && <p className="small" role="status">{saved}</p>}
      </div>
    );
  }
}
