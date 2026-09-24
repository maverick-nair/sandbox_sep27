# AI PM Launchpad (KNOLSKAPE prototype)

A playable prototype of the AI PM practice platform. Learners are new AI PMs on KNOLSKAPE's GENIE team and handle five conversational simulations with fictional stakeholders. Claude plays each stakeholder and runs the Conversation AI assessment.

Live version: published as a claude.ai artifact (Claude access, shared leaderboard and per-learner storage come from the artifact runtime). Opened anywhere else, the page runs in scripted practice mode with a backup rubric and a local-only leaderboard.

## Journeys
Onboarding, mission board, brief, live conversation (3 hidden facts, 2 pressure moments, Trust / Clarity / Risk control meters), decision with rationale and score prediction, Conversation AI assessment, consequences, XP, badges, skill progression, replay, leaderboard (overall, most improved, by mission, by skill, squads; 7 / 30 day / all-time filters; alias, name or private visibility).

## Key product decisions
- Score = rubric 60 + decision 25 + hidden facts 15; pass at 70.
- First attempt earns tier-weighted score as XP; replays earn XP only for beating your best.
- Readiness rating = best score per mission x difficulty weight, averaged, full weight after 3 missions.
- Squads rank by average, not total. Private learners are not listed and not counted.
- Claude calls: quick tier per persona turn, default tier for assessment. The viewer's own Claude usage is spent.
- All people and companies in scenarios are fictional.

## Version 2: game layer (design inspirations)
| Inspiration | What we borrowed | Where it shows up |
| --- | --- | --- |
| Duolingo | Winding path, daily goal ring, streaks with shields, weekly league card | Path home, HUD, side panel |
| Disco Elysium | Skills speak as inner voices during dialogue | Guided-mode hints in the chat |
| Reigns | Meters that move with every choice; hitting zero ends the run | Trust walk-out, delta chips, danger state |
| Ace Attorney | Present evidence to win the argument; dramatic interrupts | Evidence locker, "Pressure!" stamps |
| Brilliant | Moments of delight, visible progress | Confetti, score count-up, reward reveal |
| TryHackMe / Hack The Box | Seasons, rooms on a path, podium leaderboard | Season 1 banner, chests, league podium |
| Octalysis | Lead with meaning, mastery and empowerment; light touch on loss | Stars and replay goals; streak shields; nothing is ever taken away |
