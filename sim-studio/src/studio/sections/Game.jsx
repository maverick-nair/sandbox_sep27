// Game elements: the reward layer and the rules that make the simulation feel like a game,
// always in service of learning. XP and levels, badges, streaks, celebrations, the leaderboard
// during play, the session timer, and how much learners can see about each person.
import { ACHIEVEMENTS } from '../../engine/decisions.js';
import { defaultGame, DEFAULT_LEVELS } from '../../templates/ilead/look.js';
import { Button, Callout, Field, NumberInput, SectionHead, Seg, Switch } from '../ui.jsx';

export const VISIBILITY = {
  numbers: { label: 'Numbers', note: 'Each card shows skill, morale and result as numbers, as in the original iLead. The challenge is choosing the style that fits.' },
  bands: { label: 'Low, medium, high', note: 'Skill and morale show as bands. Learners read roughly where each person is, and results tell them if they judged well.' },
  hidden: { label: 'Hidden', note: 'Only results are visible. Learners read skill and morale from what people say and do, or spend a day on Assess member. The hardest setting.' },
};

export default function Game({ def, update }) {
  const g = { ...defaultGame(), ...(def.gamification || {}) };
  const set = (patch) => update((d) => { d.gamification = { ...defaultGame(), ...(d.gamification || {}), ...patch }; });
  const levels = g.levels?.length ? g.levels : DEFAULT_LEVELS;
  const setLevel = (i, patch) => set({ levels: levels.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const vis = def.team?.visibility || 'numbers';
  const limit = def.timeline.timeLimit ?? 0;
  const suggested = def.timeline.weeks <= 6 ? 45 : def.timeline.weeks <= 8 ? 60 : 90;

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Game elements">
        What makes the simulation feel like a game: levels, badges, streaks, celebrations, a leaderboard and a clock. Rewards only ever come from good leadership, never from speed or guessing.
      </SectionHead>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <h3>What learners can see about each person</h3>
        <Seg label="Visibility" value={vis} onChange={(v) => update((d) => { d.team.visibility = v; })} options={Object.entries(VISIBILITY).map(([value, x]) => ({ value, label: x.label }))} />
        <p className="small muted">{VISIBILITY[vis].note}</p>
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <h3>Session clock</h3>
        <div className="row">
          <Switch checked={limit > 0} onChange={(v) => update((d) => { d.timeline.timeLimit = v ? suggested : 0; })} label="Time limit for the session" />
          {limit > 0 && <><NumberInput className="xs" value={limit} min={10} max={600} onChange={(v) => update((d) => { d.timeline.timeLimit = v; })} aria-label="Minutes" /><span className="small">minutes</span></>}
        </div>
        <p className="small muted">{limit > 0 ? `A countdown shows in the header. When it reaches zero, the quarter ends and the learner goes to the debrief. About ${suggested} minutes suits ${def.timeline.weeks} weeks.` : 'No countdown. Learners take as long as they need and can stop and come back.'}</p>
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row spread"><h3>XP and levels</h3><Switch checked={g.xp !== false} onChange={(v) => set({ xp: v })} label={g.xp !== false ? 'On' : 'Off'} /></div>
        {g.xp !== false && (
          <>
            <p className="small muted">Every decision earns XP by its score and difficulty. Levels are shown in the header with a progress bar, and a level-up is celebrated.</p>
            <div className="stack" style={{ '--gap': '6px' }}>
              {levels.map((l, i) => (
                <div key={i} className="level-row">
                  <span className="level-num num">{i + 1}</span>
                  <input className="input" value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} aria-label={`Level ${i + 1} name`} />
                  <label className="row nowrap small" style={{ '--gap': '4px' }}>from <NumberInput className="xs" value={l.xp} min={0} max={5000} onChange={(v) => setLevel(i, { xp: v })} aria-label={`Level ${i + 1} XP`} disabled={i === 0} /> XP</label>
                  <Button size="sm" variant="ghost" disabled={levels.length <= 2 || i === 0} onClick={() => set({ levels: levels.filter((_, k) => k !== i) })}>Remove</Button>
                </div>
              ))}
            </div>
            <div className="row"><Button size="sm" onClick={() => set({ levels: [...levels, { name: 'New level', xp: (levels.at(-1)?.xp || 0) + 100 }] })}>Add level</Button><Button size="sm" variant="ghost" onClick={() => set({ levels: DEFAULT_LEVELS.map((l) => ({ ...l })) })}>Restore the standard levels</Button></div>
            <Switch checked={g.streaks !== false} onChange={(v) => set({ streaks: v })} label="Streaks: bonus XP for three or more strong decisions in a row" />
          </>
        )}
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row spread"><h3>Badges</h3><Switch checked={g.achievements !== false} onChange={(v) => set({ achievements: v })} label={g.achievements !== false ? 'On' : 'Off'} /></div>
        {g.achievements !== false && <div className="badge-list">{ACHIEVEMENTS.map((a) => <span key={a.id} className="badge-item"><strong>{a.label}</strong><span className="small muted">{a.note}</span></span>)}</div>}
      </div>

      <div className="card stack" style={{ '--gap': '8px' }}>
        <h3>Celebrations and comparison</h3>
        <Switch checked={g.celebrations !== false} onChange={(v) => set({ celebrations: v })} label="Celebrate 25%, 50%, 75% and 100% of the target, level-ups and badges" />
        <Switch checked={g.liveLeaderboard !== false} onChange={(v) => set({ liveLeaderboard: v })} label="Leaderboard during play (live score against everyone who finished)" />
        <Switch checked={g.liveRank !== false} onChange={(v) => set({ liveRank: v })} label="Show the learner's live rank in the header" />
        <Switch checked={g.benchmarks !== false} onChange={(v) => set({ benchmarks: v })} label="Compare the final score with others in the debrief" />
        <p className="small muted">The leaderboard's names, size and ranking are set in Settings and delivery.</p>
      </div>
      {vis === 'hidden' && !def.actions.some((a) => a.enabled && a.mechanic === 'assess') && <Callout tone="warn" icon="!">Skill and morale are hidden but Assess member is switched off, so learners have no way to check. Switch it on in Actions.</Callout>}
    </div>
  );
}
