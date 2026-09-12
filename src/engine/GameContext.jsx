import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { initialState, loadState, reducer, saveState } from './state.js';
import { onUsage } from './llm.js';

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => loadState() || initialState());

  // Autosave after every state change (every decision dispatches).
  useEffect(() => { saveState(state); }, [state]);

  // Route LLM usage into the state for the facilitator cost counter.
  useEffect(() => { onUsage((u) => dispatch({ type: 'LLM_USAGE', ...u })); }, []);

  const api = useMemo(() => ({
    state,
    dispatch,
    log: (entry) => dispatch({ type: 'LOG_DECISION', entry }),
    spend: (currency, amount) => dispatch({ type: 'SPEND', currency, amount }),
    complete: (level, result) => dispatch({ type: 'COMPLETE_LEVEL', level, result }),
    remember: (persona, note) => dispatch({ type: 'PERSONA_MEMORY', persona, note }),
    saveDraft: (level, draft) => dispatch({ type: 'SAVE_DRAFT', level, draft }),
  }), [state]);

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame() { return useContext(GameContext); }
