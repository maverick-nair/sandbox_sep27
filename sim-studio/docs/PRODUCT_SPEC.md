# GenieKreator Sim Studio: product spec

Experience > Simulations authoring, with iLead as the first template.

Status: prototype built (this folder). Owner: Product. Last updated: September 2026.

## 1. Why this exists

iLead is one of KNOLSKAPE's longest-running simulations, but the legacy product cannot be configured by anyone outside engineering. The documents show why:

- **Every variant was a fork.** The server map lists separate code and databases for iLead-flex live and test, iLead v2, Accenture, Bajaj LTI, LTI public, HR, Chinese and a 2014 deployment. A storyline insertion script and a language insertion script existed, and both are now marked deprecated.
- **The rules lived in people's heads.** The model document explains the logic in prose; the content workbook holds the numbers; the two disagree in several places (section 8).
- **Content was duplicated to handle gender.** Every event and message exists as a male copy and a female copy.
- **Nobody could tell whether a change broke the balance.** There was no way to know, before learners played, whether the target was reachable or whether a careless player could hit it too.

The Studio turns iLead into a **template**: one engine, many storylines, every client variant a configuration. Authors change the world, the people, the words and the difficulty. The engine keeps the learning logic intact and tells them when a change undermines it.

## 2. Who uses it

| Persona | Goal | What they need from the Studio |
|---|---|---|
| **Delivery consultant** (most frequent) | Fit iLead to a client in an afternoon | Quick start, one-click re-skin, a clear list of what still says "elevator", a publish button |
| **Instructional designer** | Shape the learning design | Team composition, events, responses and report copy, with the numbers hidden until needed |
| **Simulation designer** (expert) | Tune the model | Every impact, probability and formula, and a balance check to prove the result |
| **Partner or client admin** (GenieKreator licence) | Build their own variant | Guardrails: health check, balance check, versioning |
| **Learner** (end user) | Experience a fair, believable simulation | Consistent names, working copy, a target that is hard but reachable |

## 3. Product principles

1. **Start from a working simulation, never a blank page.** Every draft is playable from the first second.
2. **Say what the learner will experience, not what the engine does.** "Wait before reuse (days)" instead of "restriction"; "Both reads off" instead of "mismatch type 2".
3. **Progressive disclosure in three layers.** Quick start (2 minutes) → Studio (plain controls) → Engine settings (a single toggle reveals every number).
4. **Change one thing, and everything that depends on it moves too.** Shortening the session moves events, trigger check points, lead inflow and the target together. Renaming the company updates every string.
5. **Prove it before you publish.** A health check on every edit and a bot-driven balance check replace "play it five times and hope".
6. **Variants are settings, not copies.** Language, delivery channel, client and difficulty are layers over one definition.

## 4. Information architecture

```
GenieKreator
├── Evaluate:   Conversation AI · Nano AI · PitchPerfect AI
├── Educate:    AI Microlearn · Interactive Learn
├── Experience: Simulations (this spec) · AI RolePlay
└── Enable:     AI Koach

Experience > Simulations
├── Template gallery (iLead + storylines, planned templates)
├── Your simulations (status, health, version)
├── Create (Describe it → Check the basics, incl. interaction mix → Review the draft, incl. Decisions)
├── Studio (per simulation)
│   ├── Plan:  Overview (readiness, key numbers, migration assumptions, legacy findings)
│   ├── Build: Story and context · Funnel and target · Team · Leadership model · Actions · Events ·
│   │          Decision moments (moments, mix, scoring and KPIs, learning design) · Report
│   ├── Ship:  Settings and delivery (length, difficulty, play modes, pass mark, leaderboard, LTI 1.3,
│   │          SCORM 1.2, languages, definition file) · Learners and results (group report, cohorts,
│   │          learners, leaderboard, LMS scores)
│   └── Test:  Balance check (bots + synthetic learners) · Play as learner
│   Always available: Health check (with suggested fixes) · Publish (go-live checklist, versions, restore)
└── Learner experience (#/play/<simulation>): welcome → weekly plan → workspace → Friday wrap-up → debrief
```

## 5. Key workflows

### 5.1 Create a tailored simulation (target: under 10 minutes)

Three steps, in plain words. The author gives direction; everything else is drafted and shown for checking.

1. **Describe it.** One box: a few sentences on who it is for, the organization, what their team sells and where. Three examples fill it in one click. Goals and constraints (learning outcomes, *No firing*, *Formal tone*, *Local names*, *Fits in 45 minutes*, free text) sit in a collapsed *optional* section. *Skip, fill in a form instead* starts from the questions with no description.
2. **Check the basics.** The description is quoted at the top with *Edit description*. Anything that could not be worked out comes first as a short list of questions (at most organization, industry, location and product name, plus a one-click choice when the description contradicts itself). Below, one plain line per basic: organization, industry, what the team sells, where the team works, learners, length and difficulty, debrief focus. Each line has *Change*, which opens its fields in place; lines not taken from the description carry a small *guessed* mark. Instructions the template cannot take are listed with the reason.
3. **Review the draft.** A one-sentence summary with *Change the basics*, then four tabs to read as a learner would: *Story* (welcome letter, product text, the five stages), *Team* (ten people, each needing a different style; names editable; *Different names*), *Events* (wording editable; timing and impact fixed) and *Target* (checked automatically by practice players). *Create simulation* opens the Studio with a balance check attached.

**No dead buttons.** Actions that need Genie (*Rewrite with Genie*, *Rewrite descriptions*, *Rewrite events*, *Rewrite backgrounds*) appear only when Genie is available; without it, the letter offers *Try another version* and the team offers *Different names*, both with *Undo*. Delivery options and languages that the prototype does not run are shown as *Coming soon* and cannot be switched on. Product lines outside Simulations explain themselves when clicked. In the learner preview, *Start over* asks before discarding a run in progress, visibly starts week 1 again, and the report ends with *Play again*.

**Consistency.** Every stage is derived from one state (brief, profile, settings, author edits). Changing the country in the basics updates names, money and events in the draft; an author's own edits survive regeneration of other items and re-reading the brief.

**Safety nets (from the QA pass).**
- *Nothing is lost.* The flow autosaves every change; Simulations offers *Resume where you left off*. The Studio header shows the real save state (Saving, Saved in this browser, Not saved) and a failed save raises a banner with *Try again* and *Download a backup*. Other tabs' changes are merged, not overwritten, and pending saves are flushed when the page closes.
- *Questions only when needed, answered only by the author.* An unknown organization or product name is asked with an empty field and a one-click suggestion; sample names never fill an open question. Questions are listed first; anything else not taken from the description carries a small *guessed* mark.
- *The brief is read the way people write.* The team's location is weighed by phrasing ("team in", "based in" versus "clients in"), US states are understood, and two plausible locations become a one-click question. Negation ("don't let them fire", "not formal") is honoured and contradictions (two session lengths, both kinds of buyers) become clarifying questions.
- *Specific instructions are used or explained.* Weeks, target, stage names, team names, requested events and deal value are applied; anything the template cannot take (for example a team of 8, since iLead needs 10 people to require every style) is listed as *Not used yet* with the reason.
- *The author's words are protected.* Replacing an edited item asks first; regenerating a group skips edited items; every regeneration, new names and new letter version has *Undo*. Re-reading a changed brief lists edits written for the old context with *Keep* or *Refresh*.
- *Genie can be stopped.* While Genie reads, the brief is locked and *Stop* is available; after 20 seconds the rules take over. Duplicate requests are blocked, and a Genie answer that breaks field tokens is refused with a message.
- *The description stays in view* while checking the basics and is stored with the draft for the author only, never in the definition, versions or export. *Skip, fill in a form instead* starts from questions.
- *Industries without a pack say so.* Generic items carry a badge, and three optional questions (competitor, other offerings, a typical setback) make them specific.

**Genie and offline behaviour.** In the hosted GenieKreator, Genie reads the brief (its answer is merged over the rules, which fill any gap) and powers every *Regenerate*. Elsewhere, built-in rules read the brief (industry, offering, buyers, organization name, any country or city, audience, length, difficulty, outcomes, constraints) and *Regenerate* offers alternative versions where one exists; buttons that need Genie explain why in their tooltip.

### 5.2 Design a harder variant for senior leaders

Settings → Difficulty: Challenging (wrong styles land 75% of the time, target +15%, wider randomness) → Team: move two people into the high-skill, low-morale quadrant → Balance check confirms the skilled leader still reaches target.

### 5.3 Fix legacy content gaps

Health check lists "Missing copy: Style insight, Low use / High accuracy" for all four styles (the legacy workbook literally contains `$$$$$-------NO STRING AVAILABLE--------$$$$$$`). "Go to report" opens the style grid with the four empty cells marked **Write this**.

### 5.4 Ship a new language

Settings → Languages → Add a language. Every learner-facing text is keyed, so a language is a translation layer with a coverage count, not a new deployment. Genie translates in batches of 30 (keeping every {{token}}), or the author exports a CSV for translators and imports it back. Each translation records the English it came from, so when the English changes it is flagged as out of date; reviewed and draft translations are counted separately. Learners pick the language on the welcome screen; anything not translated shows in English. The learner screens' own buttons and labels stay in English in this version.

## 6. How complexity is hidden

| Legacy concept | What the author sees | Where the real value lives |
|---|---|---|
| Actor phase SMP table (20 people × 5 phases × 3 values) | Person cards with bars and a "Needs Directing" chip; a **diagnosis map** plotting the team on skill × morale | Engine settings: a 5 × 3 grid per person |
| Leadership style numbers 1 to 4 | Named, coloured styles; rename to fit the client's framework | Style skill and morale levels are fixed by the model |
| Mismatch type 0, 1, 2 | Outcomes named per action ("Style fits", "One read off", "Both reads off"; "Top performer passed over") | Impact numbers per outcome |
| "60% randomness" | "How often a wrong read shows: 60%" slider | Also an 80 to 120% impact multiplier |
| Restriction (days) | "Wait before reuse (days)" | Same |
| Trigger "Impact Condition" prose | A sentence with inline inputs: "When someone's performance is above [70] and a colleague covers the same stage" | Structured rule kind + parameters |
| Period and sub-period | Week and day on a drag-and-drop timeline | Same |
| PLACEHOLDER_ACTOR_NAME, male and female copies | Field chips (`{{actor}}`, `{{company}}`), one string, pronouns from the person's profile (he, she or they) | Token renderer |
| Conversion formula | Visual funnel with pass-on rates, and "if nobody improves, the team converts about 21 (48% of target)" | `output = input × ratio × (avg performance + buffer) / 100` |

## 6a. Hyper-contextualization

Two layers, so authors describe their world once and the tool does the rewriting.

**Layer 1: the organization profile.** Industry · organization · product or service · businesses or consumers · offering name and category · country and city · learner's role. Stored with the simulation (`context.profile`) and editable at any time under Story and context → Your organization.

**Layer 2: proposals derived from the profile.** Each proposal names what changes, shows before and after, and says why.

| Driver | What it changes |
|---|---|
| Industry | Industry label, competitor and rival names, portfolio products, welcome letter vision, product brief, industry versions of the crisis, new-feature, supply, criticism and regulation events, deal value |
| Product or service, businesses or consumers | Sales stage names and descriptions (four stage sets, plus industry overrides such as Pharma's territory to prescription path and Banking's eligibility, KYC and disbursal), welcome letter wording, learner role, deal value, team members' domain skills and profiles |
| Location | Currency and local deal value, home city in events, conference destination, letter signatory, board member, lunch venue, and at Deep depth local names for every team member (pronouns kept) and local institutions in their profiles |

**Depth** keeps the choice simple: *Light* (names, roles, city, money), *Standard* (plus stages, story, events, profiles), *Deep* (plus local people).

**Location.** Any of 198 countries (searchable), or a fictitious one with a chosen naming style and currency. City offers the country's 2 to 7 largest cities as one-click choices, or any city typed in, real or invented. The 8 detailed country packs refine the generated values; every other country gets currency, an approximate exchange rate, an income-scaled deal value and names from one of 21 regional naming styles.

**Coverage today:** 8 industry packs (Elevators, Banking and financial services, Insurance, Healthcare and medical devices, Pharmaceuticals, IT services and software, Manufacturing, Telecom) × 8 countries (United States, India, UAE, United Kingdom, Singapore, Germany, Australia, Japan). "Other" industries get generic, industry-neutral texts and a prompt to use Genie. A test sweeps every industry and country combination at Standard depth: none leaves a trace of the elevator storyline or introduces a validation error.

**Safety rails**
- Only words change. Timing, impacts and pass-on rates are untouched, so the balance check result is identical (covered by a test).
- **Hand edits are protected.** Every generated value is recorded. On re-tailoring, a field the author has since changed is marked "You changed this" and starts unticked.
- Re-tailoring proposes only what differs, so moving from Mumbai to Dubai shows 45 location changes, not 100.

**Genie (hosted AI) for what packs cannot cover.** Inside GenieKreator on claude.ai, *Go further with Genie* rewrites a chosen scope (items still tied to the original storyline, story and events, team profiles, or action responses) for the profile plus the author's notes. Genie must keep every field token; answers that drop or invent tokens are flagged. Every Genie change goes through the same review before it applies. Outside the hosted version the panel explains that it is unavailable and the rewrite list remains.

## 6c. Health check with suggested fixes

Every health check issue comes with a suggested fix, so no author is left with a problem and no way forward. A suggestion has three parts:

- **What it will do**, in one line: "Move Kent Goldberg to Qualify", "Add a response for *Against the trend*", "Accept the 8 migration assumptions as they are".
- **The values it will write**, pre-filled and editable: a drafted response the author can reword, a person to pick from a list, a number to adjust, checkboxes to untick. Drafts come from the simulation itself: the tailored profile (organization, product, location names), the template's original content, and response drafts written for each mechanic and outcome (a warning email to someone whose numbers are improving reads differently from one to someone slipping).
- **Apply fix** (or *Apply my version* once edited), *Back to the suggestion*, *Rewrite with Genie* for text when Genie is available, and a link to fix it by hand in the right section.

*Fix all with the suggestions* applies every suggestion as it is and repeats until nothing more can be fixed (switching actions back on can reveal their missing responses). The Publish dialog offers *Fix them with the suggestions* for blocking issues. Every fix goes through the Studio's undo. Informational items are collapsed by default.

Coverage: all 37 checks have a suggestion (empty or duplicate names and text, empty stages, conversion rates, style mapping, targets and deal value, team size and style mix, hiring pool, option styles, waits and durations, missing responses, firing cost, wrong styles that help, events and triggers outside the calendar, legacy placeholders, unknown fields, old-industry wording, migration assumptions). Tests apply the suggestions to 30 broken simulations and require a clean health check afterwards.

## 6d. Decision moments and open responses

Decision moments are the situations a learner meets inside the quarter. Each has a channel (email, chat, meeting, call, business update), a sender, a person it is about (whose live skill and morale decide which style fits), a week and day, a difficulty level (intro, core, stretch), a key concept, a situation with optional variants, and one of five interaction types:

| Type | Scored on |
|---|---|
| Single choice | The option's quality, or for style options the fit with the person's skill and morale at that moment |
| Multiple select | Precision and recall against the options marked right |
| Ranking | Distance from the right order |
| Scenario decision | The option's quality; each option has its own reaction and consequences |
| Open response | Weighted criteria (relevance, reasoning, application of concepts, completeness, judgment, decision quality) and key ideas |

Every answer lands in a band (strong 70+, mixed 40 to 69, weak) with a stakeholder reaction, a coach's note and consequences: skill, morale and performance for the person, a second person or the whole team; business KPIs (team trust and CEO confidence by default, author-defined); "remember as" flags; and later consequences that arrive weeks after the decision. Later moments can require a flag, the band of an earlier moment or a KPI threshold; alternative moments share a slot so only one appears; variants rewrite a situation based on what happened before. Moments expire at the end of their week with a "no response" outcome unless the author turns that off.

**Interaction mix.** Default 70:30 structured to open, counted per slot. The author sets the target in the creation flow or the Studio; Rebalance converts the moments that suit it best (richer, higher level first) and keeps their content; moments can be locked to their type.

**Open-response evaluation.** Genie reads each answer against the criteria, key ideas and a strong answer, with a 15-second timeout; the built-in evaluator scores instantly and offline (and inside SCORM packages). Authors can choose built-in only for consistency. Authors edit criteria and weights, draft key ideas from the strong answer, ask Genie to write criteria for the situation, and try any answer in the editor to see its score and feedback. Very short answers are capped at a weak score.

Ten health checks cover moments (outside the calendar, no situation, no question, too few options, multiple select with nothing right, no key ideas, missing coaching notes, broken conditions, people no longer on the team, mix far from the target, scoring weighted zero, reflections after the last week), each with a suggested fix.

## 6e. The learner experience

Publishing turns the definition into a workspace, not a quiz. The learner steps into the role on a welcome screen (name, leaderboard nickname, cohort code, group play, language), then runs the quarter week by week:

- **Monday plan**: choose an approach for each person, with their profile and recent signals.
- **Workspace**: an inbox of emails, chats, meeting invites and business updates; the conversation or meeting in front of them; their team with performance, mood and trend. Moments arrive as they would at work: a typing indicator in chat, a meeting room with the people present, a dashboard snapshot for business updates. Actions (one-to-ones, training, role changes, hiring) take days from the week.
- **In the moment**: the learner replies inside the thread. The sender reacts, the numbers move (effect chips), and a short coach's note explains why, collapsed when the answer landed well. Open answers show criterion bars and which key ideas were covered. "Rethink" lets the learner undo a decision that did not land (two per run by default) and try again; retries show in the debrief.
- **Friday wrap-up**: what happened, who moved, progress against pace, a spaced recall question and, in chosen weeks, a private reflection.
- **Continuity**: earlier decisions change later situations, which moments appear, the options on offer and the consequences that land weeks later.

Author preview is the same player with x-ray (true skill and morale, best options, model answers) and no result saved.

## 6f. Knowledge retention

| Principle | Where it lives |
|---|---|
| Active recall, spaced | One question per Friday on a concept met earlier, favouring the longest ago and those answered wrongly |
| Contextual application | Every moment is about a real person in the run, whose needs change with their skill and morale |
| Progressive difficulty | Intro, core and stretch levels; hints only on intro open responses |
| Immediate and delayed consequences | Effect chips at once; later consequences in the inbox weeks after |
| Contextual feedback | A two-line coach's note per answer, not a lecture; criterion notes for written answers |
| Failure and retry | Rethink, with a limited number per run |
| Reflection | Private prompts at chosen weeks, shown back in the debrief |
| Reinforcement of critical concepts | Concept scores drive recall choice and the "to reinforce" list in the debrief |
| Transfer | "Back at work" prompts and recommended next learning in the 4E products |

## 6g. Debrief and game elements

The debrief tells the story of the quarter: a headline, the overall score and tier (Gold 80+, Silver 65+, Bronze 50+), how the score is made (business results, leadership of the team, decision quality, recall; weights set by the author), conversions against pace and target, KPIs start to end, key decisions with what happened, reasoning quality from open responses with the best answer quoted, strengths and growth areas, style use, concepts to reinforce with a recall check, back-at-work prompts, recommended next learning (for example AI Koach for coaching practice, AI RolePlay for difficult conversations), achievements, a benchmark against the synthetic cohort from the balance check and, when on, a leaderboard shown after the learner has seen their own result. Experience points reward decisions weighted by difficulty; achievements reward good habits (reading the room, recovering after a rethink, recall streaks, nobody leaving), never speed or guessing.

## 6h. Delivery and results

- **Play modes**: individual, and group play (a group of 2 to 5 by default plays one run and agrees each open reply).
- **Cohorts**: a name, a code learners enter, opening and closing dates and a facilitator; changes apply straight away without publishing. Reports and leaderboards filter by cohort.
- **LTI 1.3**: tool configuration JSON (OIDC login, launch, keyset, scopes for grades and roster, Canvas placements) to copy or download; platform registrations with validation and presets for Moodle, Canvas and Blackboard; a test launch that plays the published version as an LMS learner and prepares the Assignment and Grade Services score message, visible under LMS scores. Signed launches are verified by the GenieKreator LTI service.
- **SCORM 1.2**: a zip built in the browser (manifest with mastery score, a self-contained player with the simulation baked in, the definition file), checked by reading it back. Inside the LMS it reads the learner's name, reports location, score and passed or failed.
- **Learners and results**: group report (score spread with pass line, pass rate, reasoning criteria, concepts to reinforce lowest first, every decision with its band split and most common choice, groups), cohorts, a learners table with CSV export and delete, the leaderboard and LMS score messages. Practice learners can be added to preview the report and removed together. Results are shared through the page's shared data when hosted on claude.ai, otherwise kept in the browser; reflections never leave the learner's browser.
- **Publish** is a go-live checklist (health with one-click fixes, balance, mix, translation coverage, delivery summary), a version note, then a success screen: open the learner experience, copy the learner link, set up a cohort, download the SCORM package, LTI settings. Version history with restore.

## 6b. Help in context

Every main action carries a tooltip on hover and keyboard focus that says what it does and when to use it: Health check, Balance check, Play as learner, Publish, Show engine settings, Build my simulation, Regenerate, New names, Restore to draft, and others.

On touch screens, where there is no hover, each explained control has a small *i* button that shows the same help on tap. Tips are kept inside the viewport on narrow screens. On phones, the step list and Studio sections collapse into a single *Step N of 6* or section menu. Drawers and dialogs take keyboard focus, keep it inside, and return it on close. The Studio has session *Undo* and *Redo* (Ctrl+Z, Ctrl+Shift+Z outside text boxes).

## 7. The iLead model, as implemented

Faithful to the Model Document; see `src/engine/engine.js`.

- **Time.** `weeks × daysPerWeek` (legacy 12 × 5). Monday: the learner sets a style for every team member. Actions cost days. Every elapsed day runs the funnel.
- **Needed style.** Skill and morale against the high threshold (70): low/low Directing, low/high Guiding, high/low Partnering, high/high Entrusting.
- **Style difference.** 0 if both reads are right, 1 if one is, 2 if neither is. **Mismatch** = difference, shown with probability *mismatchChance* (60%), otherwise 0.
- **Action mechanics** (the author picks content, not code):
  - *Style choice* (Meet the team, Meet face to face, Set goals, Coach, Give feedback): option style vs needed style.
  - *Team energiser* (Team lunch, Team building): this week's intended style vs needed style.
  - *Recognition by trend* (emails): performance now vs 10 days ago.
  - *Training*: this week's style, with the probability table from the model document; person away for 3 or 5 days.
  - *Role change* (reassign, swap): profile values for the new stage ± 6.
  - *Hire*, *Fire* (everyone else reacts with the Mixed outcome), *Assess* (estimates ± 6), *Reward* (top performer resents a reward given to someone else).
- **Impact** = outcome impact × random factor (0.8 to 1.2), clamped to 0..100.
- **Events** hit the team (or one person) on a set day; softer when the week's style fits the person.
- **Triggers**: six rule kinds covering all nine legacy triggers, with check points and a maximum count.
- **Funnel**: `output = input × pass-on rate × min(1, (avg stage performance + buffer) / 100)`, stage by stage. People away do not count.
- **Report**: five competencies mapped to the Skills Ontology (A1.1.1 to A1.1.5), objective band, adaptability band, per-style use × accuracy insights, action insights, consistency, reflection questions.

## 8. What the migration found in the legacy content

| Finding | Resolution |
|---|---|
| "Con - Leadership Style" sheet lists Partnering as High skill / **High** morale | Model document wins: High skill / Low morale |
| All four styles have `NO STRING AVAILABLE` for Low use / High accuracy: the legacy team never wrote "rarely used but right each time", which does happen | Auto-drafted from what each style is for, in the voice of the neighbouring cells, marked *Auto-drafted, review* |
| Two team members have "None." as their background | Auto-drafted from their experience, domain skills and skill and morale, so the text still hints at the style they need |
| Cooldowns differ: model doc says Team building 8 days, Hire 8 days; workbook says 20 and 10 | Workbook kept; open question |
| Model doc says everyone reacts negatively to a firing; workbook impacts are all zero | Warning with a one-click fix |
| Three general events have period 0 and never fire | Kept in the library, unscheduled |
| Role change after "2 months" (generic doc) vs 4 weeks (workbook) | Workbook kept |
| Emails and reassignments store negative copy under outcome 2 although the model defines only 0 and 1 | Engine falls back to the nearest outcome with copy; warning shown |
| "Desmond Marta" vs "Desmond Mart" | Stats sheet name kept |
| Male and female copies of every string | Merged with pronoun tokens |

## 9. Assumptions to confirm with the original iLead team

Values the documents do not contain. Each ships with a default, is listed on the Overview page, and can be marked confirmed.

1. Weekly lead inflow (defaults ramp 200 → 300 leads a week).
2. Performance buffer in the conversion formula (default 20).
3. Value per conversion and target (USD 50,000; target 45, calibrated by the balance check).
4. Impact of the weekly style decision (small positive when right, small negative when wrong).
5. Which reassign response fires (positive when the new stage suits the person better).
6. Competency score formulas.
7. Event multiplier by weekly style fit (0.5, 1, 1.5).
8. "Performance decreasing for N weeks" read as a net drop of 5 points or more.

## 10. Balance check

Four bots each play N full, seeded runs of the exact definition:

| Bot | Behaviour | Question it answers |
|---|---|---|
| Adaptive leader | Reads everyone correctly; greedy expected-value action choice; restructures early | Is the target reachable at all? |
| One-style leader | Directing with everyone, busy with one-to-ones | Can a single habit win? |
| Guessing leader | Random styles and actions | Does good leadership matter? |
| Hands-off leader | Random styles, no actions | What does the team do alone? |

Verdicts: *too hard* (adaptive < 110% of target), *too easy* (> 170%), *does not reward adapting* (weaker bots within 80% of the adaptive one). Each comes with a one-click fix. The suggested target puts the adaptive bot at about 130%, because learners have to infer what the bot can see.

Legacy defaults (12 weeks, target 45): adaptive 140%, one-style 44%, guessing 27%, hands-off 18%.

**Synthetic learners.** After the bots, 30 to 120 practice learners play the simulation, answering every decision moment. Each makes the adaptive choice with a probability (their skill) drawn from an S-shaped spread around a typical first-time manager, and a weak or partial answer otherwise. The check reports their overall score spread with the pass mark, pass rate, share reaching the target, and the average score of each decision moment (hardest first), with findings when the pass rate is above 85% or below 30% or a moment averages below 40. These scores are stored with the balance result and become the benchmark learners see in their debrief.

Charts: conversions week by week for each bot against the target, every run as a share of the target (one dot per run), the synthetic score histogram and per-moment difficulty bars, with the tables kept. 80 bot runs and 60 learners take about three seconds in the browser.

## 11. Data model

One JSON **Simulation Definition** (`schema: 1`) per simulation: `meta`, `context` (entities, industry, situation words), `story`, `timeline`, `leadership`, `stages`, `funnel`, `team`, `actors`, `actions`, `events`, `triggers`, `randomness`, `report`, `delivery`. Since decision moments: `decisions` (mix, evaluator, KPIs, concepts, points), `learning` (recall, reflection, rewinds, hints, reflections, transfer prompts), `scoring` (weights), `gamification` and `translations` (per language, per text key: text, source English, status). `delivery` holds play modes, pass mark, leaderboard, cohorts, LTI platforms, SCORM and languages. Older definitions are migrated on load. A **record** wraps it with status, versions (immutable snapshots with notes) and the last balance result. The runtime plays a definition; a run state is a separate serializable object with a seeded RNG, so any run can be replayed exactly.

## 12. Generalizing beyond iLead

The Studio shell (gallery, wizard, sections, health, balance, preview, publish) is template-agnostic. A template supplies: a definition builder, the mechanic library for its actions, its rule kinds, its bots and its section editors. iLead's "people × stages × styles" pattern also fits iLead PM and the HR storyline directly; Build Your Business, Trust sim, F1 Sim, Design Thinking and Agile Simulation each need their own mechanic library.

## 13. Out of scope for the prototype, needed for production

- Backend persistence, roles and review workflow (prototype uses browser storage). Requirements from the QA pass: sign-in; separation between client organizations (tenant isolation); per-simulation saves with version checks instead of one list; an audit log of edits, publishes and Genie calls; retention rules for drafts, briefs and versions; the brief visible to its author and editors only; an AI data notice and an organization-level switch to turn Genie off.
- Supported browsers: current Chrome, Edge, Firefox and Safari (desktop), Safari on iOS 16 or newer and Chrome on Android. The prototype was tested in Chromium only; Firefox and WebKit runs need a device lab before a pilot.
- Translation of the learner screens' own labels and buttons (authored content is translatable today).
- More industry and country packs, owned by content teams (the pack format is plain data in `src/templates/ilead/context-packs.js`).
- The LTI service that verifies signed launches (OIDC and JWT) and posts scores to gradebooks; the Studio prepares its configuration, registrations and score messages.
- Server-side results store with per-organization access control; the prototype uses the page's shared data when hosted, otherwise the browser.
- The other 4E product lines (Evaluate, Educate, Enable and AI RolePlay) are separate products; the debrief links to them as next learning.
- Migration of the other five legacy storylines (the script in `scripts/extract_ilead.py` handles one workbook; each storyline needs its workbook).
- GenieTracker integration of competency scores via the ontology codes.

## 14. Success measures

| Measure | Target |
|---|---|
| Time to publish a client re-skin | Under 15 minutes (legacy: a developer ticket) |
| Share of published variants with a passing balance check | 95% |
| Engineering tickets for content changes | Near zero |
| Learner-reported "unfair or confusing" in post-sim survey | Below legacy baseline |
| Published variants per quarter per consultant | Tracked; expected to rise sharply |

## 15. Open questions

1. Do we keep the workbook cooldowns (20 and 10 days) or the model document's (8 and 8)?
2. Should firing carry a cost by default? The model document says yes; the workbook says no.
3. Should learners see skill and morale directly, only after Assess, or only as colour bands? (Legacy shows RAG bands.)
4. Should "they/them" be offered for actors given verb agreement in legacy copy ("They blames")? Prototype offers it; copy review needed.
5. Who can change engine settings in a partner-licensed tenant?
