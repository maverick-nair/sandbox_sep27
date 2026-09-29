# Design Task Hub

A small web app for assigning and tracking product design work, built around the
**Product Designer Task Manager** workbook. Product managers assign tasks in a
form, designers post daily progress and weekly leave, and the owner gets the
data back as that same Excel workbook, with a Dashboard sheet added.

## Who sees what

| Person | Views | Writes to the workbook |
|---|---|---|
| Product manager | Assign task, My assignments | Tracker columns B to I (task, project, designer, priority, dates, effort) |
| Designer | My tasks, My leave | Tracker columns J to M (status, actual end date, revision rounds, blockers), Leave & Holidays |
| Owner | Dashboard, All tasks, Assign task, Designer view, Leave & holidays, People, Lists & scoring, Export to Excel | Everything, including Settings and the Scorecard period |

Designers never see the Scorecard, Settings or the dashboard. Everyone except
the owner asks to join once (role plus their name on the tracker) and the owner
approves them under **People**.

Tasks are tagged with a **master task** (the product, grouped by product line:
Platform, Evaluate, Educate, Experience, Enable) and a **subtask** (the kind of
design work), and each one links to a project. On the Tracker, Task Assigned
reads `GenieTracker / Feature design: Onboarding flow for admins`.

## The workbook

`workbook/Product Designer Task Manager (original).xlsx` is the source workbook.
`tools/build_template.py` adds three sheets to it and writes `workbook/template.xlsx`:

- **Dashboard**: KPI tiles and six native Excel charts (designer scores,
  utilisation this week, delivery status, hours logged per week, effort by
  product, tasks by project), driven by formulas on the existing sheets.
- **Task Details**: master task, subtask, progress, hours logged and latest
  note, row-aligned with the Tracker.
- **Daily Log**: one row per designer update per task per day.

The script edits the file at the XML level, so the original Tracker, Scorecard,
Settings and Leave & Holidays sheets keep every formula, table, dropdown and
conditional format unchanged. The workbook is set to recalculate fully on open.

`app/export.js` fills that template in the browser: task rows (the table grows
past its 50 template rows when needed), leave, holidays, Settings lists and
scoring values, and the Scorecard period. It can also produce a **designer
copy** with the owner-only sheets hidden and the sheet list locked.

`app/metrics.js` is the workbook's formulas in JavaScript (TAT, planned days,
delivery status, speed, quality, task score, Scorecard, weekly workload), so the
in-app dashboard shows the same numbers Excel does.

## Build and test

```
npm install
npm run build:template   # workbook/template.xlsx from the original workbook
npm run build            # dist/index.html, the single page to publish
npm test                 # export structure + Excel-vs-app formula parity
node tests/ui.smoke.js   # browser walk-through with a mocked runtime
```

The parity test recalculates a 60-task workbook in LibreOffice and compares
every auto-calculated Tracker column, the Scorecard and the weekly workload
with `metrics.js`. It needs LibreOffice Calc and `RECALC=<path to recalc.py>`;
without them it is skipped.

## Data

The published page stores its data in the artifact's own database:
`config/main` (lists, tags, holidays, scoring), `config/people` (approved
members), `claims/<person>` (join requests), `tasks/*` (tasks with their
daily updates), `leave/*` and `checkins/*` (weekly leave confirmations). Lists
and people are writable by the owner only. PMs and designers need Contributor
access to the page to save.
