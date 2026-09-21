# NanoAI Authoring

The authoring platform for NanoAI, KNOLSKAPE's scenario based micro assessment in the Evaluate portfolio (alongside Conversation AI and PitchPerfect AI). An author with no assessment background answers four plain questions or uploads documents, and the platform builds a complete, quality checked assessment they review one scenario at a time: situations, contextual analysis, scoring questions with anchors, MCQ keys, and AI recommended time and response caps. This implements the authoring scope of the NanoAI Product Requirements Document (sections 9, 11, 12, 13.1 to 13.9 and the authoring rows of 16 and 17). Participant delivery, scoring of real responses, calibration and reporting are out of scope for this build; the preview shows how they would work.

## Run

```
npm install
npm run dev        # local development
npm run build      # production build in dist/
npm run preview    # serve the production build on port 4174
npm test           # deterministic engine tests (planner, gate fixtures, scoring formulas, PII, mapping)
```

## AI configuration

Open Settings and enter an Anthropic API key. Calls go from the browser to the Anthropic Messages API for intent extraction, Skill re-ranking, scenario writing, contextual analysis, scoring question and MCQ generation, scoped regeneration, re-keying, and the preview scorer. Every call requests a JSON schema and fails closed on malformed output. A base URL can point at a server side proxy so keys never sit in the browser.

Without a key the platform runs in scripted mode: a library of 48 hand written scenarios (3 per Skill) with contextual analyses, scoring questions, keyed MCQ options and model answers, filled with the author's client terminology and balanced names. Every screen and every rule works identically in both modes; scripted mode says so on each generated element.

## The authoring flow

1. **Describe intent.** Audience and purpose are required. Situations can be typed or uploaded (PDF, DOCX, PPTX, XLSX, TXT, extracted in the browser). Uploads pass PII and SPII detection; the author confirms anonymization before anything is generated. Situations, roles and terms are extracted and shown with their source.
2. **Confirm Skills.** 3 to 5 atomic Skills are proposed from a frozen ontology subset with High, Medium or Low confidence and the evidence. Accept, swap, search in plain words, or map a client Skill name; Low confidence must be confirmed; gap Skills are flagged.
3. **Blueprint.** A deterministic planner produces scenarios per Skill, response type per scenario, MCQ question counts, difficulty and situation tag spread, and a time plan before any scenario exists. Over the 60 minute target it applies the PRD reduction order (media, convert to MCQ, drop, then complexity) and shows every change. The author changes any cell and observations and time recompute live.
4. **Review scenarios.** One per screen: context header, situation, media, prompt, contextual analysis, and the scoring instrument. Inline edit anything; editing the situation or media re-runs the analysis and shows changed scoring questions for confirmation with approval reset; editing an option re-keys it; anchors are checked for distinct levels. Regenerate a scenario, a scoring question, an MCQ question, an option or a single sentence with a plain instruction. Switch response type, adjust time and caps within range, add or generate media, flag for KNOLSKAPE review, mark approved.
5. **Preview as participant.** Desktop and 390 point mobile frames, welcome with data protection note, practice recording and MCQ, soft countdown per scenario, audio recording with level meter, 15 second warning and auto stop at the cap, transcript correction limited by edit distance, text with live character count that stops at the cap, switch to text when the microphone is unavailable, then a sample report built with the Section 13 formulas.
6. **Quality gate.** Every hard block and soft warning from Section 9.1 Step 6, in outcome language with a fix and a link to the scenario. One failing test fixture exists per hard rule.
7. **Configure and publish.** Name, audience, languages, window, sittings, retake policy, report visibility, exports. Publish creates an immutable version pinned to ontology, model and prompt versions; the first three assessments in a workspace go to KNOLSKAPE review; editing a published assessment starts a new version.

The workspace, an audit log of every change with actor and before and after state, and an AI call log live in the browser and can be exported.

## Structure

- `src/content/` the frozen ontology subset (16 atomic Skills with indicators, L0 to L3 levels and situation tags), the PRD rules as constants, the 48 scenario seeds, and the sample assessment.
- `src/engine/` blueprint planner and reduction order, duration and cap planner, quality gate, bias screen, PII shield, Skill mapper, generator (LLM with validation, scripted fallback, scoped regeneration, re-analysis, re-key), scoring formulas, document ingestion, workspace store with versions, undo and audit.
- `src/steps/` one file per authoring step. `src/screens/` home, settings and the step router. `src/components/` UI primitives, media renderers and editor, shell.
- `tests/` node test suite over the engine.
