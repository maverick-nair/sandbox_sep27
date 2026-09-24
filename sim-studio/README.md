# GenieKreator Sim Studio

Creation and delivery platform for GenieKreator **Experience > Simulations**, with the legacy **iLead** leadership simulation migrated as the first template. Authors re-skin, tune, test and publish simulation variants without engineering help, and learners play them as an immersive business simulation.

The product spec is in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Run

```
npm install
npm run dev              # local development
npm test                 # engine, template, validator, balance, brief and QA regression tests
npm run balance          # balance check for the iLead template from the command line
npm run build            # production build in dist/
npm run build:artifact   # single self-contained HTML in dist/sim-studio.html
```

## What is in the prototype

- **Create**: the author describes what they need; a three-step flow (describe it, check the basics, review the draft) infers the rest, asks only what it cannot tell, sets the interaction mix and lets the author change how each decision is answered. Built-in rules read the description everywhere; Genie reads it in the hosted version.
- **Decision moments**: emails, chats, meetings, calls and business updates with five interaction types (single choice, multiple select, ranking, scenario, open response), a 70:30 structured to open mix by default, criteria-based evaluation of open answers (Genie or built-in), consequences, branching, variants, later consequences, spaced recall and reflections.
- **Learner experience**: a workspace with an inbox, conversations and meetings, the team and live KPIs, a Monday plan and Friday wrap-up each week, rethinks, achievements and a full debrief with benchmarks and a leaderboard.
- **Delivery**: individual and group play, cohorts with codes, LTI 1.3 configuration and test launches, SCORM 1.2 packages built in the browser, languages with Genie translation and review, and a Learners and results section with the group report and CSV export.
- **Any country or a fictitious one**, with the 2 to 7 largest cities as choices or any city typed in.
- **Hyper-contextualization**: describe the organization (industry, product or service, businesses or consumers, country and city); the Studio proposes tailored names, money, sales stages, story, events and people, each with its reason, at Light, Standard or Deep depth. Hand edits are protected on re-runs. Genie (hosted AI) rewrites anything the packs do not cover.
- **Studio**: Overview, Story and context, Funnel and target, Team, Leadership model, Actions, Events, Decision moments, Report, Settings and delivery, Learners and results.
- **Show engine settings**: one toggle reveals every number the plain view hides.
- **Health check**: runs on every change, with a suggested fix for every issue.
- **Balance check**: four bot leaders and a synthetic learner cohort play seeded runs; charts show trajectories, every run, the score spread and how hard each decision is.
- **Play as learner**: the learner experience in author preview, with x-ray.
- **Publish**: a go-live checklist, immutable versions with notes, restore, and the learner link.

Simulations are kept in the browser's local storage. Learner results use the page's shared data when hosted on claude.ai, otherwise the browser.

## Structure

- `scripts/extract_ilead.py`: one-time migration of the legacy content workbook into `src/templates/ilead/legacy-content.json` (tokenizes placeholders and names, merges male and female copies).
- `src/templates/ilead/`: builds a Simulation Definition from the migrated content; lists migration assumptions and legacy findings. `context-packs.js` holds industry, location and stage packs; `contextualize.js` turns a profile into proposals and applies them.
- `src/engine/`: pure, serializable, seeded runtime (`engine.js`), bots and balance check, validator, report scoring, text tokens, authoring helpers (timeline rescale, difficulty presets).
- `src/engine/decisions.js` and `nlp.js`: decision moments, consequences, branching, recall, achievements, scoring, and open-response evaluation.
- `src/learner/`: the learner experience (player, moments, week plan and wrap-up, debrief, SCORM player).
- `src/delivery/`: SCORM 1.2 packaging and runtime, LTI 1.3 configuration and score messages.
- `src/studio/`: React UI for authoring, delivery and results.
- `tests/`: `node --test` suite.
