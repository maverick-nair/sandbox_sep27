import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { initialState, loadState, reducer, saveState } from './state.js';
import { onUsage } from './llm.js';

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => loadState() || initialState());
  const draftTimers = useRef({});

  // Autosave after every state change (every decision dispatches).
  useEffect(() => { saveState(state); }, [state]);

  // Route LLM usage into the state for the facilitator cost counter.
  useEffect(() => { onUsage((u) => dispatch({ type: 'LLM_USAGE', ...u })); }, []);

  const api = useMemo(() => ({
    state,
    dispatch,
    log: (entry) => dispatch({ type: 'LOG_DECISION', entry }),
    spend: (currency, amount) => dispatch({ type: 'SPEND', currency, amount }),
    complete: (level, result) => { clearTimeout(draftTimers.current[level]); dispatch({ type: 'COMPLETE_LEVEL', level, result }); },
    remember: (persona, note) => dispatch({ type: 'PERSONA_MEMORY', persona, note }),
    // Drafts are debounced so typing does not re-render the whole app on every keystroke.
    saveDraft: (level, draft) => {
      clearTimeout(draftTimers.current[level]);
      draftTimers.current[level] = setTimeout(() => dispatch({ type: 'SAVE_DRAFT', level, draft }), 400);
    },
  }), [state]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame() { return useContext(GameContext); }

// Catches render errors so a broken save never leaves a blank page. Offers export and reset without dialogs.
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Launch Window crashed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    const saved = (() => { try { return localStorage.getItem('launch-window-save-v1') || ''; } catch { return ''; } })();
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-zinc-200">
        <div className="font-mono text-xs tracking-widest text-sky-300">SOMETHING BROKE</div>
        <h1 className="mt-2 text-2xl font-semibold">The sandbox hit an error it could not recover from.</h1>
        <p className="mt-2 text-sm text-zinc-400">Your progress is still saved in this browser. Copy the save below and send it to your facilitator, then reload. If reloading shows this page again, reset the save.</p>
        <pre className="mt-4 max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400">{String(this.state.error?.message || this.state.error)}</pre>
        <textarea readOnly className="mt-3 h-24 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400" value={saved} aria-label="Saved game JSON" onFocus={(e) => e.target.select()} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded bg-amber-500 px-3.5 py-2 text-sm font-medium text-zinc-950" onClick={() => location.reload()}>Reload</button>
          <button className="rounded border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm" onClick={() => { try { localStorage.setItem('launch-window-save-v1-broken', saved); localStorage.removeItem('launch-window-save-v1'); } catch {} location.reload(); }}>Reset the save and reload</button>
        </div>
      </div>
    );
  }
}
