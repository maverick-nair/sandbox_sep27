# Design review: legacy iLead screens and the new learner experience

Twelve screens of the live iLead simulation were reviewed against the GenieKreator build, as product manager (what learners must understand and do), product designer (how it looks and feels) and senior developer (what the content model and runtime must carry).

## What the legacy product gets right

| Screen | What it does well |
|---|---|
| Welcome | A real person (the CEO, with a portrait) welcomes the learner, over a photo of a meeting room. It feels like a first day. |
| About product | The product has a face: an illustration of the Levo B10 next to its story. |
| Your targets | The objective is concrete and numbered: revenue ($240,000), conversions (8, at $30,000 each), and improving team skill, morale and performance, with the duration (8 weeks) and the session time (60 minutes). |
| Team floor | The team is an org chart: "YOU, Sales Director" at the top, five role columns, a photo card per person with "Hi, I'm Kent. How do you do?" and "Know more about me". The CEO's note asks the learner to meet at least three people before proceeding. |
| Profile | Three columns: the profile (photo, skill, morale and result rings, "Your style with her", previous company, joined, experience, skills, remarks), the history of interactions, and the actions for that person. |
| HUD | Day, week (1/8) and time left (59:50) always visible; team skill, morale and result as rings; the revenue target as a progress bar. Objective, Tutorial, Video and Leaderboard one click away. |
| Responses | "In response to your leadership style" with the average impact on skill, morale and result, and View History. |
| Tour | Coach marks over each area on the first visit. |

## Where the GenieKreator build fell short

1. **No faces, no product, no place.** Every person was a coloured circle with initials; the CEO, the product and the office had no image; the organization was a paragraph.
2. **The objective was buried.** The target was one card among four; revenue, team goals and the time limit were missing.
3. **No team floor.** The team was a sidebar list. The org chart, which is how iLead teaches that each stage depends on the one before, was gone.
4. **Thin game layer.** XP and achievements existed but were almost invisible during play; no levels, no streaks, no celebrations, no leaderboard or rank until the very end, no timer.
5. **Nothing to author.** Authors could not add a logo, a CEO photo, a product image or team photos, choose a scene, set revenue goals or a time limit, or shape the game layer.

## The design

**Principles.** Every screen has a face. The objective is always visible. The team is a place, not a list. Rewards celebrate good leadership, never speed. Everything is authored and tailored, never hard-coded.

**Visual system.** Illustrated portraits generated for every person (varied skin tones, hair, clothing and accessories, stable per person, matched to pronouns), replaced by uploaded photos when the author adds them. Product illustrations by category (elevator, banking, software, phone, car, energy, health, consumer goods) or the author's own image. Scenes behind the briefing and the workspace (meeting room, city, open office, studio) or the author's own. The organization's logo and brand colour carry through the HUD, the briefing and the debrief.

**Briefing.** Welcome (the CEO's portrait and letter), the organization (logo, fact cards), the product (image and story), your targets (revenue, conversions and value, team goals, duration, time limit), meet your team (portrait cards to turn over, "Hi, I'm Kent"), how to lead them, how the simulation works. Then the learner accepts the role.

**Workspace.** A HUD with day, week and a countdown when a time limit is set; team skill, morale and result rings; revenue against target; level, XP and rank. The centre is the team floor: "YOU" at the top, a column per stage with its live count, a portrait card per person with rings and this week's style. A profile modal shows the profile, the interaction history and the actions for that person. The inbox stays on the left; actions with icons sit on the right with the sales funnel.

**Game layer.** Levels earned with XP (names set by the author), streaks for consecutive strong decisions, celebrations at 25, 50, 75 and 100 percent of the target, a badge shelf, a live leaderboard and rank chip during play, and a session timer. What learners see about people is an author choice: the numbers (as in legacy iLead), bands (low, medium, high) or hidden (read from what people say, or Assess).

**Authoring.** Two new Studio sections. Look and feel: brand colour, logo, scene, CEO portrait, product image and every team portrait, each uploaded or illustrated, with a live preview. Game elements: XP and levels, achievements, streaks, celebrations, the in-play leaderboard, the time limit and what learners can see about people. The briefing gains welcome, product and targets chapters, with editable team goals. Health checks and suggested fixes cover the new settings, and SCORM packages carry the images inside the zip.

**Reports.** The original user and group reports are rebuilt section for section (see PRODUCT_SPEC section 6i): the learner's leadership report is a tab in the debrief, the group report sits in Learners and results with a benchmark, and both download as a standalone page. Charts carry their numbers and labels so colour is never the only signal; the matrix and grids scroll inside their card on a phone rather than squeezing.
