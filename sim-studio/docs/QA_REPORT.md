# Sim Studio QA Report

Build: branch `claude/elegant-ptolemy-6j40rz`, commit `42d16e7`. Browser: Chromium 141 (Playwright). Date: 24 September 2026.

## Verdict

Not ready for real authors yet. The happy path is fast and coherent for the eight industry packs, but work can be lost silently, the brief reader misplaces teams from ordinary phrasing, generated text can contain gaps, and the health check does not catch blank or duplicate content.

## Counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Critical | 3 |
| High | 7 |
| Medium | 12 |
| Low | 10 |

## Fix order

**Before any pilot:** QA-01 (Work is silently lost once browser storage fills up), QA-02 (Generated text has blanks when the brief does not name the product), QA-03 (Team location is misread from common phrasing, and labelled as coming from the brief), QA-04 (All progress in the creation flow is lost on refresh or navigation), QA-05 (The whole app goes blank on any unexpected error), QA-06 (Organization question is pre-filled with a sample name, blocks Continue, and can silently use the sample), QA-09 (Health check lets clearly broken simulations be published)

**Next iteration:** QA-07 (Specific instructions in a detailed brief are silently ignored), QA-08 (Changing the brief after editing keeps edits that now contradict the new context), QA-10 (Brief reader misses common ways authors write), QA-11 (Constraints and contradictions are handled by accident), QA-12 (Regenerate, Try another version and New names throw away the author's own edits), QA-13 (No way to stop a slow or stuck Genie reading), QA-15 (Rapid clicks start duplicate Genie requests), QA-18 (Phone layout hides progress and help), QA-19 (Drawers do not move keyboard focus), QA-22 (The raw brief is stored inside the simulation and every version)

**Backlog:** QA-14 (Genie changes that break field tokens are dropped with no message), QA-16 (Two open tabs overwrite each other's work), QA-17 (The last edit is lost if the page closes within a quarter second), QA-20 (Team names follow a region, not the country), QA-21 (Industries outside the packs get generic content without saying so), QA-23 (No accounts, isolation or data notice), QA-24 ("Needs you" badge on fields that are never asked), QA-25 (Unapplied profile changes in the Studio are dropped when switching tabs), QA-26 (Fairness message always says about 130%), QA-27 (Stock phrasing that reads oddly for some industries), QA-28 (The brief disappears after step 1, and there is no path without a brief), QA-29 (No undo in the Studio), QA-30 (Language, LTI and SCORM settings do nothing yet), QA-31 (Only Chromium was tested; some features need newer browsers), QA-32 ("Create with Genie" branding when Genie is not available)

## Journeys

| Journey | Input | Result | What happened |
|---|---|---|---|
| First-time author, very little input | Brief "leadership" | Completed | Three questions asked (right ones). Clearing the org answer let a sample name through (QA-06); product name never asked, so letters could have blanks (QA-02). |
| Experienced author, detailed instructions | Weeks, target, stages, names, event, fee | Completed with rework | Org re-asked although given (QA-10); prefilled question blocked Continue (QA-06); weeks, target, stages, names, event and fee dropped silently (QA-07). |
| Author who repeatedly edits | Edit letter, try versions, rename stage | Completed with loss | Try another version discarded the hand-written letter with no undo (QA-12). Empty stage name accepted and not flagged (QA-09). Cancel on edit works. |
| Incomplete or ambiguous information | "Atlanta, Georgia", "CEO David" | Wrong result | Team placed in Tbilisi with Russian names; David read as a city in Panama; both labelled "From your brief" (QA-03). |
| Goes back and changes an earlier stage | Mumbai bank to London IT | Inconsistent | Profile, stages, events and names updated correctly; the author's Mumbai letter and "KYC gate" stage survived into the London IT draft (QA-08). |
| Relies on AI recommendations | IT services in London example, accept all | Passed | Whole flow in about 2 seconds, create 0.6 s. Letter, stages (Prospecting to Contract and onboarding), events, GBP deal value and No firing all applied; balance check attached: skilled leader 129%, guessing 26%. |
| Overrides AI content by hand | Empty and duplicate names, empty event | Completed, unsafe | New names replaced typed names (QA-12). Empty name, duplicate names and empty event text all passed the health check (QA-09). |
| Learner playthrough of a created draft | Every day to the report | Passed | Full 12-week run to the report with no errors (about 8 s scripted); INR and local names carried through; competency scores shown. |

## Issues

### QA-01 Work is silently lost once browser storage fills up
**Severity:** Critical · **Type:** Bug · **Where:** Persistence (Studio, all screens)

**Steps to reproduce**
1. Open any simulation in the Studio.
2. Publish repeatedly (each version stores a full 110 KB copy of the simulation).
3. After about 45 versions of one simulation, keep editing.
4. Reload the page.

**Expected:** Either every change is saved, or the author is told clearly that saving failed and how to protect their work.

**Actual:** Storage stops growing at 5,186,960 characters (the browser limit). Further saves fail with no message; the header still says "Saved in this browser". After reload the list shows v45 although v46 was published. The same happens sooner with several simulations or duplicates.

**Impact:** Authors lose work without knowing it, which destroys trust in the tool.

**Evidence:** Scripted: 45 publishes, stored size 5,186,960 chars, last version missing after reload. store.js swallows the write error in an empty catch.

**Recommendation:** Surface write failures as a persistent error with an export option. Store versions as diffs or on the server, cap version history, and replace "Saved in this browser" with a real save state (Saving, Saved, Not saved).

### QA-02 Generated text has blanks when the brief does not name the product
**Severity:** Critical · **Type:** Bug · **Where:** Create with Genie: Story, People and events; Studio

**Steps to reproduce**
1. Use this template.
2. Brief: "Team leads at Solaris Energy in Lagos, selling rooftop solar systems to households."
3. Answer the industry question with "Solar energy".
4. Continue to Story.

**Expected:** A product name is inferred or asked for; no learner-facing text contains gaps.

**Actual:** The letter reads "the recently launched ." and "lead the team selling ." and "Information on  and the parameters". The product brief starts with " is the newest addition". No question was asked for the product name and the health check does not flag the empty value.

**Impact:** Learners would see broken copy in the first screen of the simulation. Happens for every industry outside the 8 packs and whenever a product name is missing.

**Evidence:** Solar brief, Story step: blanks where the product name should be.

**Recommendation:** Add the product or service name to the questions when it cannot be inferred, or draft a plausible name and label it Suggested. Never render an empty field token; add a health check rule for empty context fields.

### QA-03 Team location is misread from common phrasing, and labelled as coming from the brief
**Severity:** Critical · **Type:** AI Quality Issue · **Where:** Create with Genie: brief reading (built-in rules)

**Steps to reproduce**
1. Brief: "Sales managers at Meridian Bank in India who sell loans to clients in Germany."
2. Also try: "Team leads at Peach Insurance in Atlanta, Georgia..." , "Our CEO David wants...", "Florence, our L&D head, needs this..."

**Expected:** The team is placed where it works (India; Atlanta, United States). Person names are not read as cities. Uncertain locations are confirmed with the author.

**Actual:** India plus German clients becomes Berlin, Germany (longest country name wins). "Atlanta, Georgia" becomes Tbilisi, Georgia with Russian names and GEL currency. "CEO David" becomes the city David, Panama. "Florence" becomes Florence, Italy. The context step labels these "From your brief".

**Impact:** Currency, names, city and events all follow the wrong country; the false "From your brief" label discourages the author from checking.

**Evidence:** "Atlanta, Georgia" read as Tbilisi, labelled From your brief.

**Recommendation:** Weight phrases like "in", "based in", "team in" over "clients in"; recognise US states; require a location preposition before matching a city; mark location as Inferred and ask when two or more countries appear. Let Genie arbitrate when available.

### QA-04 All progress in the creation flow is lost on refresh or navigation
**Severity:** High · **Type:** Bug · **Where:** Create with Genie (all steps)

**Steps to reproduce**
1. Write a brief and go to step 4.
2. Refresh the page, or click "Simulations" in the breadcrumb.

**Expected:** The draft flow is kept (auto-saved) or the author is warned before leaving.

**Actual:** The app returns to the Simulations list; the brief, answers and edits are gone. No confirmation is shown.

**Impact:** A single accidental click or tab reload wipes several minutes of work, typically right before the author finishes.

**Evidence:** Scripted: after refresh on step 4 the author sees "Simulations"; breadcrumb click shows no confirmation.

**Recommendation:** Persist the flow state (brief, profile, settings, edits) as a draft on every change and offer "Resume where you left off". Warn on leave with unsaved changes.

### QA-05 The whole app goes blank on any unexpected error
**Severity:** High · **Type:** Bug · **Where:** Global; reproduced via Settings and delivery > Replace from JSON

**Steps to reproduce**
1. Turn on Show engine settings.
2. Settings and delivery > Replace from JSON: paste {"schema":1,"meta":{"templateId":"ilead"},"stages":[]}.
3. Click Replace this simulation.

**Expected:** Invalid input is rejected with a clear message; any runtime error shows a recoverable error screen.

**Actual:** The screen goes completely blank. Console: "Cannot read properties of undefined (reading 'weeks')". The import only checks three fields. There is no error boundary anywhere in the app.

**Impact:** One bad import or one unexpected data shape leaves the author with a white screen and no way back except reload.

**Evidence:** Studio after importing a partial definition: blank screen.

**Recommendation:** Add an app-level error boundary with "Reload" and "Export my work". Validate imports against the full definition schema and show exactly what is wrong.

### QA-06 Organization question is pre-filled with a sample name, blocks Continue, and can silently use the sample
**Severity:** High · **Type:** Bug · **Where:** Create with Genie: Context questions

**Steps to reproduce**
1. Brief: "For Meridian Bank in Mumbai. 8 weeks..." (org not detected because "For" is capitalised).
2. Look at the question "What is your organization called?".
3. Separately: brief "leadership", type a letter in the org field, delete it, pick Banking as industry.

**Expected:** The field is empty or shows a clearly marked suggestion; if the value is acceptable the author can accept it; an empty answer is never replaced behind the author's back.

**Actual:** The field shows "Meridian Bank" (the banking sample) yet the button says "Answer 1 question to continue" and stays disabled until the author deletes and retypes the same text. In the second case Continue becomes enabled with an empty field, and the letter then says "Welcome on board Meridian Bank!", a name the author never gave.

**Impact:** Authors are stuck on a question that looks answered, or ship a fictional client name without noticing.

**Evidence:** Organization question pre-filled with the sample name; Continue disabled.

**Recommendation:** Keep question fields empty with the suggestion as placeholder plus a "Use Meridian Bank" button; treat an empty answer as unanswered; never apply pack sample names once a question has been asked.

### QA-07 Specific instructions in a detailed brief are silently ignored
**Severity:** High · **Type:** AI Quality Issue · **Where:** Create with Genie: brief reading (rules and Genie schema)

**Steps to reproduce**
1. Brief: "For Meridian Bank in Mumbai. 8 weeks. Target 60 conversions. Our stages are Prospect, Pitch, Paperwork, Approval, Payout. Team of 8 with names Ravi and Sita. Include an RBI audit event in week 3. Average loan fee INR 25000. Challenging."
2. Complete the flow to Review.

**Expected:** Stated specifics are applied, or the author is told which ones could not be used.

**Actual:** Only "Challenging" and the results focus are applied. Review shows 90 minutes / 12 weeks (not 8 weeks), target 46 (not 60), stages Leads, Eligibility check, Offer, Documents and KYC, Disbursal (not the five given), no Ravi or Sita, no RBI event, default loan value. Nothing tells the author these were dropped. The Genie brief schema has no fields for target, weeks, stages, team size, names or events either.

**Impact:** Experienced authors, the most valuable users, discover late that their instructions were not followed and must redo them by hand.

**Evidence:** Scripted review row: "Session 90 minutes, 12 simulated weeks, challenging | Stages Leads → Eligibility check → ...".

**Recommendation:** Extend the brief schema (weeks or minutes, target, currency and deal value, stage names, team size and names, requested events). Show a "Used from your brief / Could not use yet" list on the Context step.

### QA-08 Changing the brief after editing keeps edits that now contradict the new context
**Severity:** High · **Type:** Bug · **Where:** Create with Genie: going back to step 1

**Steps to reproduce**
1. Brief for Meridian Bank in Mumbai; on Story rename stage 2 to "KYC gate" and edit the letter to mention Mumbai.
2. Go to Learning design, then click "Your brief" in the step list.
3. Change the brief to Brightpath Technologies in London (IT services) and Build again.
4. Open Story.

**Expected:** The author is asked whether to keep or refresh edits that belong to the old context.

**Actual:** The London IT simulation still has the Mumbai letter and the "KYC gate" stage. No notice is shown.

**Impact:** Mixed-context content reaches learners (a London IT firm with Indian banking stages).

**Evidence:** Scripted: "stale edited letter still mentions Mumbai: true | stale stage KYC gate: true".

**Recommendation:** When the brief or profile changes, list the author edits that referenced the old values and offer Keep, Refresh or Review each.

### QA-09 Health check lets clearly broken simulations be published
**Severity:** High · **Type:** Bug · **Where:** Studio: Health check and Publish

**Steps to reproduce**
1. In a definition, set any of: empty company or product name, empty stage name, two stages with the same name, empty or duplicate team member names, empty event text, empty welcome letter, all actions switched off, target of 1, value per conversion of 0.
2. Open Health check.

**Expected:** Each is flagged; blanks and all-actions-off block publishing.

**Actual:** None of the eleven cases is flagged. Publish is allowed.

**Impact:** The main safety net misses exactly the mistakes AI-assisted and manual editing produce most often.

**Evidence:** Validator diff against the template baseline: all 11 probes "NOT FLAGGED". In the browser, a flow with an empty name, duplicate names and an empty event text shows only the 3 legacy warnings.

**Recommendation:** Add rules for empty and duplicate names, empty learner-facing text, no enabled actions, and implausible target or value; block publish on blanks.

### QA-10 Brief reader misses common ways authors write
**Severity:** High · **Type:** AI Quality Issue · **Where:** Create with Genie: brief reading (built-in rules)

**Steps to reproduce**
1. Try: "Meridian Bank wants a leadership simulation..." , "For Meridian Bank in Mumbai...", "for team leads at acme logistics in dubai", "...at Brightpath Technologies.", '...be "fun"!!!', a Hindi brief.

**Expected:** Organization, industry and location are found regardless of position, case and punctuation; quoted adjectives are not taken as names.

**Actual:** Org at sentence start or after a capitalised "For" is not found and is asked. Lowercase names and cities are missed ("dubai" is not found). Trailing punctuation is kept ("Brightpath Technologies."). The quoted word "fun" becomes the organization. "Technologies" and "Industries" are not read as IT or manufacturing. A Hindi brief is not understood at all (three questions).

**Impact:** The flow asks questions the brief already answered, which undercuts the promise of "tell us only what we could not work out".

**Evidence:** Brief probe of 23 inputs (see Journey 2 and the Appendix).

**Recommendation:** Case-insensitive matching with sentence-start handling, punctuation trimming, org suffix list (Technologies, Industries, Group...), a quoted-name heuristic that prefers title case, and Genie as the primary reader where available.

### QA-11 Constraints and contradictions are handled by accident
**Severity:** Medium · **Type:** AI Quality Issue · **Where:** Create with Genie: brief reading

**Steps to reproduce**
1. "Please don't let them fire anyone."
2. "Exclude the firing action."
3. "The tone should not be formal, keep it casual."
4. "A 45-minute session, but make it the full 90 minutes."
5. "...selling to consumers and businesses equally."

**Expected:** Negations are understood; contradictions are surfaced as a question.

**Actual:** Both firing phrasings are missed (firing stays on). "Not formal" sets formal tone on. The first number wins (45 minutes) and buyers become Businesses, all silently.

**Impact:** The simulation contradicts what the author asked for, without telling them.

**Evidence:** Brief probe results.

**Recommendation:** Handle negation around constraint words; detect conflicting values and ask one clarifying question.

### QA-12 Regenerate, Try another version and New names throw away the author's own edits
**Severity:** Medium · **Type:** UX Issue · **Where:** Create with Genie: Story, People and events

**Steps to reproduce**
1. Edit the welcome letter and Save.
2. Click Try another version.
3. Or type team member names, then click New names.

**Expected:** A warning or an undo; the author's version is recoverable.

**Actual:** The hand-written letter and the typed names are replaced instantly. There is no undo or version history.

**Impact:** Authors learn to avoid the regenerate buttons, the main way to get more value from AI.

**Evidence:** Scripted: "manual letter survives: false | undo control present: 0"; typed names replaced by the pack names.

**Recommendation:** Keep a per-item history with Undo, or confirm "Replace your edited version?". Offer "Regenerate the rest" that skips edited items.

### QA-13 No way to stop a slow or stuck Genie reading
**Severity:** Medium · **Type:** UX Issue · **Where:** Create with Genie: Build my simulation

**Steps to reproduce**
1. With Genie available but not answering, click Build my simulation.

**Expected:** A Stop control and a time budget after which the built-in reading is used.

**Actual:** The button shows "Genie is reading your brief..." indefinitely. The only exit is Cancel, which leaves the flow. The brief stays editable meanwhile, so the result can be for text that has since changed.

**Impact:** Authors wait with no feedback and no recovery path.

**Evidence:** Genie not answering: the button waits indefinitely, no Stop.

**Recommendation:** Add Stop, show elapsed time, fall back to rules after about 20 seconds, and lock or re-read the brief if it is edited during reading.

### QA-14 Genie changes that break field tokens are dropped with no message
**Severity:** Medium · **Type:** Bug · **Where:** Create with Genie: Regenerate

**Steps to reproduce**
1. Regenerate the welcome letter when Genie returns text with an unknown field (e.g. {{companyname}}).

**Expected:** A message explains that the new version was not used and why, with a retry option.

**Actual:** Nothing changes and no message is shown; it looks as if the button does not work.

**Impact:** Confusion and repeated paid retries.

**Evidence:** Scripted: "content changed: false | any message shown: []".

**Recommendation:** Show "Genie's version used a field we do not recognise, so we kept yours. Try again." and log the failure for the AI team.

### QA-15 Rapid clicks start duplicate Genie requests
**Severity:** Medium · **Type:** Bug · **Where:** Create with Genie: Regenerate buttons

**Steps to reproduce**
1. Click Regenerate three times quickly.

**Expected:** One request.

**Actual:** Three Genie calls, each spending the viewer's Claude usage.

**Impact:** Wasted cost and possible rate limiting.

**Evidence:** Scripted: "rapid regenerate clicks → Genie calls: 3".

**Recommendation:** Guard with an in-flight flag set synchronously before the request, not only through React state.

### QA-16 Two open tabs overwrite each other's work
**Severity:** Medium · **Type:** Bug · **Where:** Persistence

**Steps to reproduce**
1. Open the Studio in tab A and rename the simulation.
2. In tab B, duplicate a simulation.

**Expected:** Both changes are kept, or tab B warns that data changed elsewhere.

**Actual:** Tab B writes its stale copy of the whole list; tab A's rename is gone.

**Impact:** Silent data loss for authors who keep several tabs open.

**Evidence:** Scripted: stored names after both actions do not include "Edited in tab A".

**Recommendation:** Listen to storage events and merge or lock; in production, save per simulation with version checks.

### QA-18 Phone layout hides progress and help
**Severity:** Medium · **Type:** UX Issue · **Where:** Create with Genie and Studio at 360 px

**Steps to reproduce**
1. Open the flow on a 360 px wide screen and go to step 4.

**Expected:** A compact progress indicator; help available on touch.

**Actual:** The step list becomes a sideways strip that uses about a quarter of the screen and shows two steps. Tooltips never appear on touch, so disabled buttons (for example Regenerate backgrounds) look like plain text with no reason. The Publish tooltip runs off the left edge (-172 to 88 px).

**Impact:** Mobile reviewers cannot tell where they are or why actions are unavailable.

**Evidence:** 360 px: step strip uses a quarter of the screen; disabled Regenerate backgrounds unexplained.

**Recommendation:** Use a compact "Step 4 of 6" header with a menu; show help as tap-to-reveal info icons; keep tooltips inside the viewport.

### QA-19 Drawers do not move keyboard focus
**Severity:** Medium · **Type:** UX Issue · **Where:** Studio: Health check, Balance check, editors

**Steps to reproduce**
1. Focus Health check with the keyboard and press Enter.

**Expected:** Focus moves into the drawer and is trapped until it closes.

**Actual:** Focus stays on the trigger button behind the overlay.

**Impact:** Keyboard and screen reader users cannot operate drawers reliably (accessibility risk for enterprise buyers).

**Evidence:** Scripted: "focus moves into drawer on open: false".

**Recommendation:** Move focus to the drawer heading, trap focus, return it to the trigger on close.

### QA-20 Team names follow a region, not the country
**Severity:** Medium · **Type:** AI Quality Issue · **Where:** Tailoring: local names

**Steps to reproduce**
1. Brief for a team in Nigeria or Kenya.

**Expected:** Names typical of the country.

**Actual:** A pan-regional mix (Kenya gets Chinedu Eze, Kwame Asante, Tendai Mutasa; the Nigeria CEO is Chipo Moyo, a Zimbabwean name). The Georgia misread produced Russian names.

**Impact:** Local learners notice immediately; it weakens the "hyper-contextual" promise.

**Evidence:** Tailoring output and solar letter signature.

**Recommendation:** Per-country name pools for the top 30 markets; let Genie refine names for others; add a "Review names" hint.

### QA-21 Industries outside the packs get generic content without saying so
**Severity:** Medium · **Type:** AI Quality Issue · **Where:** Create with Genie (rules mode)

**Steps to reproduce**
1. Create for a solar, retail or hotel business.

**Expected:** The author is told the content is generic and offered Genie or a few targeted questions.

**Actual:** Portfolio reads "our established range, our entry range"; events read "A serious incident involving ... at a customer site". The only notice is a callout inside the Studio after creation.

**Impact:** Authors ship bland content believing it was tailored.

**Evidence:** Solar brief, Story step: blanks where the product name should be.

**Recommendation:** Show a "Generic for your industry" badge on affected items in the flow; ask two or three industry questions (typical risks, buyers, sales cycle) to fill a pack on the fly.

### QA-22 The raw brief is stored inside the simulation and every version
**Severity:** Medium · **Type:** Bug · **Where:** Security and data handling

**Steps to reproduce**
1. Write a brief that includes a private remark, e.g. "Our CEO David is difficult".
2. Create the draft; open Settings > Definition file.

**Expected:** Working notes stay private to the author and are not exported with the simulation.

**Actual:** The brief is saved as meta.brief in the definition, copied into each published version and included in the exported JSON.

**Impact:** Sensitive notes can travel to clients, other authors or the runtime.

**Evidence:** Definition contains the brief text (CreateFlow sets def.meta.brief).

**Recommendation:** Store the brief separately with author-only access and strip it from exports and published versions.

### QA-23 No accounts, isolation or data notice
**Severity:** Medium · **Type:** Requirement Gap · **Where:** Security and data handling

**Steps to reproduce**
1. Use the prototype on a shared computer; use Genie with client details in the brief.

**Expected:** Author sign-in, per-tenant isolation, and a clear notice of what is sent to the AI.

**Actual:** Everything lives in the browser profile, visible to anyone using it. Genie receives the brief and context under the viewer's account with only the platform consent prompt.

**Impact:** Blocks enterprise use; privacy review will fail.

**Evidence:** Architecture review of store.js and Genie calls.

**Recommendation:** Define production requirements: authentication, tenant isolation, audit log, data retention, AI data notice and opt-out.

### QA-17 The last edit is lost if the page closes within a quarter second
**Severity:** Low · **Type:** Bug · **Where:** Persistence

**Steps to reproduce**
1. Rename a simulation and reload immediately.

**Expected:** The rename is saved.

**Actual:** The rename is lost (saves are delayed 250 ms and not flushed on unload).

**Impact:** Occasional lost edits that are hard to explain.

**Evidence:** Scripted: "rename survived immediate reload: false".

**Recommendation:** Flush pending saves on pagehide and visibilitychange.

### QA-24 "Needs you" badge on fields that are never asked
**Severity:** Low · **Type:** UX Issue · **Where:** Create with Genie: Context

**Steps to reproduce**
1. Brief without an audience.

**Expected:** Either a question for the audience or a "Suggested" badge.

**Actual:** Audience shows "Needs you" but there is no question and Continue does not require it.

**Impact:** Confusing: the author searches for what they must do.

**Evidence:** Organization question pre-filled with the sample name; Continue disabled.

**Recommendation:** Use "Suggested" for defaults that are not asked; reserve "Needs you" for real questions.

### QA-25 Unapplied profile changes in the Studio are dropped when switching tabs
**Severity:** Low · **Type:** UX Issue · **Where:** Studio: Story and context > Your organization

**Steps to reproduce**
1. Change the country, then switch to another Studio section without clicking Apply.

**Expected:** A reminder that changes are not applied.

**Actual:** The changes disappear silently.

**Impact:** Minor rework.

**Evidence:** Scripted: no pending-change indicator.

**Recommendation:** Show "Not applied yet" with Apply and Discard, or confirm on leave.

### QA-26 Fairness message always says about 130%
**Severity:** Low · **Type:** AI Quality Issue · **Where:** Create with Genie: Learning design

**Steps to reproduce**
1. Reach Learning design with any brief.

**Expected:** A message that helps the author judge difficulty.

**Actual:** The skilled-leader figure is always about 130% because the target is set from it; only the "guessing" figure carries information.

**Impact:** Looks like analysis but tells the author little.

**Evidence:** Design step: "reaches about 130% of it; guessing or one habit reaches about 31%".

**Recommendation:** Say "Target set so a strong leader just beats it; guessing reaches 31%" and show how often a mid-skill learner succeeds.

### QA-27 Stock phrasing that reads oddly for some industries
**Severity:** Low · **Type:** AI Quality Issue · **Where:** Tailoring: welcome letter

**Steps to reproduce**
1. Create for Meridian Bank.

**Expected:** Natural copy for the sector.

**Actual:** "Meridian Bank is a relatively small banking company"; legacy profiles keep phrases like "go-to guy" and "Finance Major".

**Impact:** Slightly unpolished learner experience.

**Evidence:** j1 letter text.

**Recommendation:** Industry-specific letter openings; a light Genie polish pass for learner-facing copy.

### QA-28 The brief disappears after step 1, and there is no path without a brief
**Severity:** Low · **Type:** Enhancement · **Where:** Create with Genie

**Steps to reproduce**
1. Move past step 1.

**Expected:** The brief stays visible as reference; experienced authors can skip it.

**Actual:** The brief is only visible by going back. "Build my simulation" requires text, so an author who wants to configure by hand must invent a brief.

**Impact:** Extra back-and-forth; friction for power users.

**Evidence:** Walkthrough.

**Recommendation:** Pin a collapsible "Your brief" panel on every step; add "Set up without a brief".

### QA-29 No undo in the Studio
**Severity:** Low · **Type:** Enhancement · **Where:** Studio

**Steps to reproduce**
1. Change a value, then try to undo.

**Expected:** Undo and redo.

**Actual:** Only restore from a published version.

**Impact:** Fear of experimenting.

**Evidence:** Walkthrough.

**Recommendation:** Session undo stack (Ctrl+Z) per simulation.

### QA-30 Language, LTI and SCORM settings do nothing yet
**Severity:** Low · **Type:** Requirement Gap · **Where:** Studio: Settings and delivery

**Steps to reproduce**
1. Add a language; toggle LTI or SCORM.

**Expected:** Defined behaviour, or clear "coming soon" labels.

**Actual:** A language shows "0 of N translated" forever; toggles have no effect.

**Impact:** Authors may promise clients features that do not exist.

**Evidence:** Walkthrough.

**Recommendation:** Label as planned, or hide until implemented; document the requirements.

### QA-31 Only Chromium was tested; some features need newer browsers
**Severity:** Low · **Type:** Requirement Gap · **Where:** Compatibility

**Steps to reproduce**
1. Review browser features used.

**Expected:** A supported-browser list verified in CI.

**Actual:** Firefox and Safari could not be run in this environment. Country search relies on datalist (unsupported in Firefox for Android, limited in iOS Safari); colours use color-mix (Safari 16.2+); structuredClone needs Safari 15.4+.

**Impact:** Unknown failures for Mac, iPad and Android users.

**Evidence:** Code review.

**Recommendation:** Define supported browsers; add Firefox and WebKit runs; replace datalist with an accessible combobox.

### QA-32 "Create with Genie" branding when Genie is not available
**Severity:** Low · **Type:** UX Issue · **Where:** Home, Create flow

**Steps to reproduce**
1. Open the flow outside claude.ai.

**Expected:** Wording that matches what is running.

**Actual:** Headings and tooltips promise Genie; only the side note says rules are used.

**Impact:** Wrong expectations about quality.

**Evidence:** Walkthrough.

**Recommendation:** Adapt headings ("Create from a brief") and show a small "Genie offline" status.

## Performance

| Measure | Result | Assessment |
|---|---|---|
| Brief reading (rules) | 94 to 149 ms | Good |
| Brief reading, 27,600-character brief | 11 ms | Good |
| Typing in the creation flow (org name) | about 7 ms per key | Good |
| Typing in the Studio (welcome letter) | about 8 ms per key | Good |
| Fairness calibration on Learning design | under 1 s | Good |
| Create draft (includes a 40-run balance check) | 0.6 s | Good |
| Balance check, 40 runs x 4 bots | 1.4 s | Good |
| Full learner run, 60 days, scripted | about 8 s | Good |
| Storage per simulation version | 110 KB each; limit reached at about 45 versions | Risk (QA-01) |
| Genie response time | Not measured: Genie was simulated | Untested |

## Compatibility

| Environment | Status | Notes |
|---|---|---|
| Chromium 141 (desktop, headless) | Tested | 360, 768, 1024 and 1920 px wide; light and dark: no horizontal overflow, no console errors. |
| Firefox | Not available here | Risk: datalist on Android; otherwise standard APIs. |
| Safari / iOS | Not available here | Needs Safari 16.2+ for color-mix; datalist limited on iOS. |
| Touch devices | Emulated width only | Tooltips unavailable on touch (QA-18). |

## What works well

- The rules path completes a realistic brief to a playable draft in about two seconds, with the balance check attached.
- For the eight industry packs, tailoring is coherent: stages, letter, events, currency and names all line up with the context.
- Questions stay on screen while being answered, and the country and city pickers work for all 198 countries and fictitious places.
- Genie failures (rate limited, not allowed) fall back to the built-in reading with a clear message.
- User input is always rendered as text: a brief containing a script tag is displayed harmlessly.
- Performance is comfortably fast everywhere measured; no layout breaks at 360 to 1920 px, in light or dark mode.
- The learner loop runs end to end to the report without errors.

## Method and limits

Journeys were scripted in a real browser and outcomes verified in saved data. Genie was replaced by a controllable stand-in (success, rate limit, refusal, hang, malformed answers), so real Genie quality and latency were not measured. Firefox and Safari were not available. No destructive security testing.
