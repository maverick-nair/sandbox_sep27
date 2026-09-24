> This repository also contains **GenieKreator Sim Studio** in [`sim-studio/`](sim-studio/): the Experience > Simulations authoring tool with iLead as its first template. See [`sim-studio/README.md`](sim-studio/README.md).

# LAUNCH WINDOW

The KNOLSKAPE AI Product Management sandbox. A browser-based, gamified capstone in which the learner joins Helios Works as its first AI Product Manager and has one quarter (eight sprints) to take "Helios Assist" from idea to a governed, profitable launch.

## Run

```
npm install
npm run dev        # local development
npm run build      # production build in dist/
npm run preview    # serve the production build on port 4173
npm test           # deterministic scoring tests
```

## LLM configuration

Open the Facilitator view (top right, or the link on the intro screen) and enter an Anthropic API key. Calls go from the browser to the Anthropic Messages API for persona conversations (Sprints 5 and 8), synthetic user reactions (Sprint 6) and judging of free text (Sprints 3, 4, 5, 7 and 8). Without a key the sandbox stays playable: personas run in scripted mode and judges apply a neutral score with a visible notice. A base URL can point at a server-side proxy so keys never sit in the browser.

The facilitator view shows the token and cost counter, the full decision log with judge scores (CSV export), settings, and save import and export.

## Structure

- `src/content/` fixed content: feature cards and expert key, traces, model price tables, persona system prompts, event deck, UX patterns, incident cards, dossier template. Facilitators edit scenarios here without touching game logic.
- `src/engine/` game state (single serializable JSON object with a level state machine, autosaved after every decision), LLM wrapper and judges.
- `src/components/` drag and drop (native HTML5 plus pointer events, with a keyboard alternative on every interaction), UI primitives, shell.
- `src/levels/` one file per sprint. Each exports a deterministic `score...` function used by tests.
- `src/screens/` intro, facilitator view, debrief.

## Accessibility

Every drag and drop interaction has a keyboard path: focus an item, press Enter to select it, Tab to a target, press Enter to place it. Escape cancels. Placements are announced through a live region.

## Definition of done, mapped

1. All eight sprints are playable end to end. Headless runs of the full loop complete in a few minutes; a solo learner writing real justifications lands well inside 90 minutes.
2. Every mechanic names its skill in the sprint header and feeds at least one Readiness Meter (see `LEVELS` in `src/content/index.js`).
3. Carry-forward consequences: the citation layer (Sprint 2), the ship threshold and ship or hold call (Sprint 3), the fine-tune trap (Sprint 2 into Sprint 4), the CFO over-promise (Sprint 5), and the approval checkpoint (Sprint 6) all change the severity of the Sprint 7 incident and the CFO pre-read in Sprint 8.
4. Persona conversations call the Anthropic Messages API and receive a compact memory of earlier conversations in their system prompt.
5. The debrief compares the four meters to the Module 0 baseline, lists the three best and three costliest decisions with the stronger move, names two skills for AI Koach reinforcement, and exports to PDF through the browser print dialog.
6. The facilitator view lists every decision with timestamps and judge scores, and shows the token and cost counter.
7. Every drag and drop interaction has a keyboard alternative and works with pointer events on touch.

## Team mode

Pass-and-play. Choose Team on the intro screen and name the AI PM, Engineering Partner and Governance Liaison. Each sprint shows role-specific input panels. The AI PM records whether each input was considered or logs a reason for setting it aside. Inputs ignored without a reason cost Stakeholder points.

## QA fixes applied (September 2026)

Model calls now use low effort with a 2,000 token output budget and treat empty or truncated replies as failures. Completed sprints replay read-only from the stored result. A React error boundary offers export and reset without browser dialogs; saved games are validated and migrated when the content version changes. The debrief has a real print stylesheet. Drag and drop supports click or tap to select and then click or tap a target, alongside drag and keyboard. Every submit button shows a requirements checklist. Events are drawn automatically on sprint entry. Secondary text meets WCAG AA contrast. The facilitator view has a connection test, the last error reason, a facilitator guide (expert keys, rubrics, consequence map) and copyable export fallbacks for embeds that block downloads.

Still open and needing a backend decision: server-side key custody and judging, learner identity and cohort records, and LMS integration. See the QA report for the full list.
