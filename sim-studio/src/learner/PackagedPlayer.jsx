// The player on its own, as shipped in a SCORM package: no Studio, the simulation baked in,
// progress and the final score reported to the LMS through the SCORM API when one is present.
import { useMemo } from 'react';
import Player from './Player.jsx';
import { findScormApi, scormAdapter } from '../delivery/scorm.js';

export default function PackagedPlayer({ pkg }) {
  const scorm = useMemo(() => scormAdapter(findScormApi(), { passScore: pkg.passScore }), [pkg.passScore]);
  const name = useMemo(() => scorm?.learnerName() || '', [scorm]);
  return (
    <>
      {!scorm && <div className="pkg-note" role="status">Not connected to a learning platform. You can play, and your result stays in this browser.</div>}
      <Player def={pkg.def} mode="live" saveKey={`gk-scorm-${pkg.simId}-v${pkg.version}`} delivery={{ ...pkg.def.delivery, cohorts: [], leaderboard: false }} identityDefaults={{ name }} scorm={scorm} />
    </>
  );
}
