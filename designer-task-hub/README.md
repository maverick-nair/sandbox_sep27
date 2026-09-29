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

## Role based access by official ID

Everyone signs in with their claude.ai work account. Under **People & access**
the owner searches the organisation by official email, picks the person, and
gives them one role (product manager or product designer) plus their name on
the tracker. Accounts outside the official email domain (set on the same page,
defaulting to the owner's domain) are turned away. People who are not set up
yet can send an access request from their link, which the owner approves or
declines. The page stores only each person's opaque account id with their
role; names, photos and emails are looked up live and never saved.

## The task funnel

Draft -> Awaiting approval -> Approved (tasks created) or Changes requested
(PM edits and resubmits) or Rejected. Nothing reaches a designer until the
owner approves. Each approved subtask becomes one Tracker row, and on the
Tracker Task Assigned reads `Nano AI / Feature design: Question editor ...`.

## Batches: videos, demos and other repeated deliverables

A subtask can carry a **Quantity** and **Unit** (for example 12 videos), with
optional titles one per line. It stays one Tracker row, so on-time and quality
scores are not skewed by 12 near-identical rows. In the funnel the owner can
**Split** a batch between designers (each share becomes its own Tracker row)
or merge it back. The designer gets a checklist on the task card: each item
has a title, status, revision rounds and a file link. Progress is the share
of items done, the task closes when every item is done, and Tracker Revision
Rounds is the average per item (rounded). The **Deliverables** sheet lists
every item, and the Dashboard charts deliverables completed per week and
hours per deliverable.

## Design

A frosted-glass app window on a soft gradient in KNOLSKAPE colours (Science
Blue, Ebony, Gold, Orange, the rainbow top line, Cambria titles). Wide screens
get a sidebar and top bar with search and alerts, tablets an icon rail, phones
a bottom dock. Each interface tints its hero banner and navigation: Task
Creation blue, Designer Tracker orange, Owner Dashboard gold on ebony. Chart
colours are brand steps checked for colour-blind separation in light and dark.

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
`tools/build_template.py` adds five sheets to it and writes `workbook/template.xlsx`:

- **Dashboard**: KPI tiles and seven native Excel charts (designer scores,
  utilisation this week, delivery status, hours logged per week, effort by
  product, tasks by project, deliverables per week), driven by formulas on the
  existing sheets.
- **Task Details**: master task, subtask, progress, hours logged and latest
  note, 4E line, master task title and request ID, row-aligned with the Tracker.
- **Daily Log**: one row per designer update per task per day.
- **Task Funnel**: every submitted request, one row per subtask, with the
  owner's decision, note and resulting Task ID.
- **Deliverables**: one row per item inside a batch task.

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
| `config/people` also holds | Owner | The official email domain |
| `claims/<person>` | That person | Access request |
| `requests/<pm>/items/*` | That PM (the owner reads and decides) | Requests with their subtasks and decision history |
| `tasks/*` | Owner (on approval) | Approved tasks, one per subtask |
| `progress/<designer>/tasks/*` | That designer | Status, progress, revisions, blockers and daily updates |
| `leave/<designer>`, `leave/<designer>/items/*` | That designer | Weekly leave confirmations and leave entries |

PMs and designers need Contributor access to the page to save. PMs cannot
see each other's requests, and nobody but the owner can create or change
approved tasks or the lists.
