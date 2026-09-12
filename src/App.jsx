import React, { useEffect, useState } from 'react';
import { GameProvider, useGame, ErrorBoundary } from './engine/GameContext.jsx';
import { TopBar, LevelNav, PRDPanel } from './components/Shell.jsx';
import Intro from './screens/Intro.jsx';
import Facilitator from './screens/Facilitator.jsx';
import Debrief from './screens/Debrief.jsx';
import Level1Triage from './levels/Level1Triage.jsx';
import Level2Architecture from './levels/Level2Architecture.jsx';
import Level3EvalLab from './levels/Level3EvalLab.jsx';
import Level4MarginRoom from './levels/Level4MarginRoom.jsx';
import Level5Gauntlet from './levels/Level5Gauntlet.jsx';
import Level6TrustStudio from './levels/Level6TrustStudio.jsx';
import Level7Incident from './levels/Level7Incident.jsx';
import Level8Launch from './levels/Level8Launch.jsx';

const LEVEL_COMPONENTS = { 1: Level1Triage, 2: Level2Architecture, 3: Level3EvalLab, 4: Level4MarginRoom, 5: Level5Gauntlet, 6: Level6TrustStudio, 7: Level7Incident, 8: Level8Launch };

function Game() {
  const { state, dispatch } = useGame();
  const [facilitator, setFacilitator] = useState(false);
  const [prd, setPrd] = useState(false);

  useEffect(() => {
    const onNext = () => {
      if (state.phase === 'debrief') return;
      if (state.currentLevel >= 8) { dispatch({ type: 'OPEN_DEBRIEF' }); window.scrollTo({ top: 0 }); return; }
      dispatch({ type: 'GOTO_LEVEL', level: state.currentLevel + 1 });
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('lw:next', onNext);
    return () => window.removeEventListener('lw:next', onNext);
  }, [state.currentLevel, state.phase, dispatch]);

  if (state.phase === 'intro') {
    return (
      <>
        <Intro onOpenFacilitator={() => setFacilitator(true)} />
        {facilitator && <Facilitator onClose={() => setFacilitator(false)} />}
      </>
    );
  }

  const Level = LEVEL_COMPONENTS[state.currentLevel];
  return (
    <div className="min-h-full">
      <TopBar onOpenFacilitator={() => setFacilitator(true)} onOpenPRD={() => setPrd((v) => !v)} />
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <LevelNav />
          {state.phase === 'playing' && state.levelStatus[8] === 'complete' && <button className="text-xs text-amber-300 underline" onClick={() => dispatch({ type: 'OPEN_DEBRIEF' })}>Open debrief</button>}
        </div>
        {state.phase === 'debrief' ? <Debrief /> : <Level key={state.currentLevel} />}
      </main>
      <PRDPanel open={prd} onClose={() => setPrd(false)} />
      {facilitator && <Facilitator onClose={() => setFacilitator(false)} />}
      <footer className="no-print mx-auto max-w-[1500px] px-4 pb-6 text-[11px] text-zinc-600">KNOLSKAPE AI PM Sandbox. Helios Works is fictional. Autosaves after every decision.</footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <GameProvider>
        <Game />
      </GameProvider>
    </ErrorBoundary>
  );
}
