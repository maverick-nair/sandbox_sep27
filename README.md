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
