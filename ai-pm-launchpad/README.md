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
