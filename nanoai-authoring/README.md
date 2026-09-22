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

Four stages, all reachable from the sidebar.

1. **Brief.** One capture box: speak (browser dictation), upload a brief (PDF, DOCX, PPTX, XLSX, TXT, extracted in the browser) or type. Uploads pass PII and SPII detection and the author confirms anonymization. Who is being assessed and why sit beside it. The platform proposes 3 to 5 Skills from a frozen ontology subset with confidence and evidence; the author accepts, swaps, searches in plain words or maps a client Skill name, then presses one button and every scenario is planned and written.
2. **Scenarios.** A plan strip shows scenarios, Skill coverage, estimated time and the order setting, with "Adjust plan" opening the blueprint (response type, questions, difficulty, tags, media, time plan and the PRD reduction order). Below it, one scenario per screen: situation, media, contextual analysis, scoring questions with anchors or keyed MCQ options, recommended time and caps. Inline edits re-run the analysis with changes held for confirmation; option edits re-key; regeneration works per scenario, question, option or sentence with a plain instruction.
3. **Preview.** Desktop and 390 point mobile frames, practice recording and MCQ, soft countdown, audio with cap and transcript correction, text with live count, then a sample report from the Section 13 formulas. Scenario order is shuffled per participant by default, seeded by the attempt, with Skills interleaved and no more than two audio scenarios in a row; a fixed order is available for parallel forms.
4. **Publish.** The quality gate summary with every hard block and suggestion, each linking to where it is fixed, then name, audience, languages, window, sittings, retake policy, scenario order, report visibility and exports. Publish creates an immutable version pinned to ontology, model and prompt versions.

The workspace, an audit log of every change with actor and before and after state, and an AI call log live in the browser and can be exported.

## Structure

- `src/content/` the frozen ontology subset (16 atomic Skills with indicators, L0 to L3 levels and situation tags), the PRD rules as constants, the 48 scenario seeds, and the sample assessment.
- `src/engine/` blueprint planner and reduction order, per participant form ordering, duration and cap planner, quality gate, bias screen, PII shield, Skill mapper, generator (LLM with validation, scripted fallback, scoped regeneration, re-analysis, re-key), scoring formulas, document ingestion, workspace store with versions, undo and audit.
- `src/stages/` the Brief, Scenarios and Publish stages; `src/steps/` the review, blueprint, gate, preview and configuration components they compose. `src/screens/` dashboard, settings, help and the stage router. `src/components/` UI primitives, media renderers and editor, shell.
- `tests/` node test suite over the engine.
