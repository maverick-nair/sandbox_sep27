# Design Task Hub

A small web app for requesting, approving and tracking product design work,
built around the **Product Designer Task Manager** workbook. Product managers
submit task requests, the owner approves them through a task funnel, designers
post daily progress and weekly leave, and the owner gets everything back as
that same Excel workbook with a Dashboard sheet added.

## Three interfaces, three links

One page serves three separate interfaces. Each group gets only its own link,
and each interface has its own header, colour and navigation:

| Link | Interface | For | What they do |
|---|---|---|---|
| `#pm` | **Task Creation** (navy) | Product managers | Build a request: 4E line, product (options depend on the line), project name, master task title, priority, brief, then one or more detailed subtasks, each with its own start, end and hours, shown on a live timeline. PMs don't choose designers; the owner assigns every subtask. Submit to the owner, save a draft, and follow each request's status and, once approved, its live progress. |
| `#designer` | **Designer Tracker** (teal) | Product designers | Only their own approved tasks and a personal timeline. Post one update per task per day (status, progress, hours, revision rounds, note, blocker) and log leave weekly. |
| `#owner` | **Owner Dashboard** (graphite) | The owner only | Task funnel (approve, send back with a note, or reject; adjust designers and dates first, with a capacity check), overview dashboard, all tasks, leave, people and links, lists and 4E setup, Excel export. |

Opening another group's link shows a short "this page is for ..." notice.
First-time visitors ask to join from their link; the owner approves them under
**People & links**, which also has copy buttons for the three links.

## The task funnel

Draft -> Awaiting approval -> Approved (tasks created) or Changes requested
(PM edits and resubmits) or Rejected. Nothing reaches a designer until the
owner approves. Each approved subtask becomes one Tracker row, and on the
Tracker Task Assigned reads `Nano AI / Feature design: Question editor ...`.

## Project names

PMs type the project name. As they type, existing projects are offered, and a
name that only differs in case, spacing, punctuation or word order is saved as
the existing project. A close but different name (a typo, a shorter or longer
version) is suggested as "Similar existing project", and the PM can pick it or
keep their name. A new name travels with the request marked "New project";
the owner can rename or merge it in the funnel, and approving adds it to the
project list with the requesting PM as lead, so the Tracker's PM (Project
Lead) column maps it. Matching lives in `matchNames` in `app/metrics.js`.

## The workbook

`workbook/Product Designer Task Manager (original).xlsx` is the source workbook.
`tools/build_template.py` adds four sheets to it and writes `workbook/template.xlsx`:

- **Dashboard**: KPI tiles and six native Excel charts (designer scores,
  utilisation this week, delivery status, hours logged per week, effort by
  product, tasks by project), driven by formulas on the existing sheets.
- **Task Details**: master task, subtask, progress, hours logged and latest
  note, 4E line, master task title and request ID, row-aligned with the Tracker.
- **Daily Log**: one row per designer update per task per day.
- **Task Funnel**: every submitted request, one row per subtask, with the
  owner's decision, note and resulting Task ID.

The script edits the file at the XML level, so the original Tracker, Scorecard,
Settings and Leave & Holidays sheets keep every formula, table, dropdown and
conditional format unchanged. The workbook is set to recalculate fully on open.

`app/export.js` fills that template in the browser: task rows (the table grows
past its 50 template rows when needed), leave, holidays, Settings lists and
scoring values, and the Scorecard period. It can also produce a **designer
copy** with the owner-only sheets hidden and the sheet list locked.

`app/app.js` is the page script (all three interfaces). `app/metrics.js` is the workbook's formulas in JavaScript (TAT, planned days,
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

The page keeps its data in the artifact's own database, with access rules so
each group can only write its own part:

| Path | Written by | Holds |
|---|---|---|
| `config/main` | Owner | Designers, PMs, projects with lead PM, 4E lines with products, subtask types, holidays, scoring |
| `config/people` | Owner | Approved members (role, name on the tracker) |
| `claims/<person>` | That person | Join request |
| `requests/<pm>/items/*` | That PM (the owner reads and decides) | Requests with their subtasks and decision history |
| `tasks/*` | Owner (on approval) | Approved tasks, one per subtask |
| `progress/<designer>/tasks/*` | That designer | Status, progress, revisions, blockers and daily updates |
| `leave/<designer>`, `leave/<designer>/items/*` | That designer | Weekly leave confirmations and leave entries |

PMs and designers need Contributor access to the page to save. PMs cannot
see each other's requests, and nobody but the owner can create or change
approved tasks or the lists.
