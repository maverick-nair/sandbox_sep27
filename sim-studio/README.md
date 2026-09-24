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

- **Create with Genie**: the author writes a short brief, outcome and constraints; a six-step guided flow (brief, context, story, people and events, learning design, review) infers the rest, asks only what it cannot tell, and lets the author edit or regenerate each stage. Built-in rules read the brief everywhere; Genie reads it in the hosted version.
- **Any country or a fictitious one**, with the 2 to 7 largest cities as choices or any city typed in.
- **Hyper-contextualization**: describe the organization (industry, product or service, businesses or consumers, country and city); the Studio proposes tailored names, money, sales stages, story, events and people, each with its reason, at Light, Standard or Deep depth. Hand edits are protected on re-runs. Genie (hosted AI) rewrites anything the packs do not cover.
- **Studio**: Overview, Story and context (context fields, rewrite list, letters, tour), Funnel and target, Team (diagnosis map, per-stage values), Leadership model, Actions (options, responses, impacts), Events (drag-and-drop timeline, trigger rule sentences), Report (competency bands, style insight grid, sample report), Settings and delivery (length, difficulty, channels, languages, definition file).
- **Show engine settings**: one toggle reveals every number the plain view hides.
- **Health check**: runs on every change, with jump-to and one-click fixes.
- **Balance check**: four bot leaders play seeded runs and report who reaches the target.
- **Play as learner**: the full iLead loop, with an author x-ray of true skill and morale.
- **Publish**: immutable versions with notes and restore.

Data is kept in the browser's local storage in this prototype.

## Structure

- `scripts/extract_ilead.py`: one-time migration of the legacy content workbook into `src/templates/ilead/legacy-content.json` (tokenizes placeholders and names, merges male and female copies).
- `src/templates/ilead/`: builds a Simulation Definition from the migrated content; lists migration assumptions and legacy findings. `context-packs.js` holds industry, location and stage packs; `contextualize.js` turns a profile into proposals and applies them.
- `src/engine/`: pure, serializable, seeded runtime (`engine.js`), bots and balance check, validator, report scoring, text tokens, authoring helpers (timeline rescale, difficulty presets).
- `src/studio/`: React UI.
- `tests/`: `node --test` suite.
