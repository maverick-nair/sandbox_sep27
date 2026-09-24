# GenieKreator Sim Studio

Authoring tool for GenieKreator **Experience > Simulations**, with the legacy **iLead** leadership simulation migrated as the first template. Authors re-skin, tune, test and publish simulation variants without engineering help.

The product spec is in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Run

```
npm install
npm run dev              # local development
npm test                 # engine, template, validator and balance tests
npm run balance          # balance check for the iLead template from the command line
npm run build            # production build in dist/
npm run build:artifact   # single self-contained HTML in dist/sim-studio.html
```

## What is in the prototype

- **Template gallery and Quick start**: a four-step wizard (purpose, context, funnel, review) that produces a playable draft.
- **Studio**: Overview, Story and context (context fields, rewrite list, letters, tour), Funnel and target, Team (diagnosis map, per-stage values), Leadership model, Actions (options, responses, impacts), Events (drag-and-drop timeline, trigger rule sentences), Report (competency bands, style insight grid, sample report), Settings and delivery (length, difficulty, channels, languages, definition file).
- **Show engine settings**: one toggle reveals every number the plain view hides.
- **Health check**: runs on every change, with jump-to and one-click fixes.
- **Balance check**: four bot leaders play seeded runs and report who reaches the target.
- **Play as learner**: the full iLead loop, with an author x-ray of true skill and morale.
- **Publish**: immutable versions with notes and restore.

Data is kept in the browser's local storage in this prototype.

## Structure

- `scripts/extract_ilead.py`: one-time migration of the legacy content workbook into `src/templates/ilead/legacy-content.json` (tokenizes placeholders and names, merges male and female copies).
- `src/templates/ilead/`: builds a Simulation Definition from the migrated content; lists migration assumptions and legacy findings.
- `src/engine/`: pure, serializable, seeded runtime (`engine.js`), bots and balance check, validator, report scoring, text tokens, authoring helpers (timeline rescale, difficulty presets).
- `src/studio/`: React UI.
- `tests/`: `node --test` suite.
