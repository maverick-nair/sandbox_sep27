# Design Task Hub

A standalone web platform for requesting, approving and tracking product design work,
built around the **Product Designer Task Manager** workbook. Product managers
submit task requests, the owner approves them through a task funnel, designers
post daily progress and weekly leave, and the owner gets everything back as
that same Excel workbook with a Dashboard sheet added. It runs on Firebase
(Hosting, Authentication and Firestore); see [DEPLOY.md](DEPLOY.md) to put it live.

## Three interfaces, three links

One page serves three separate interfaces. Each group gets only its own link,
and each interface has its own header, colour and navigation:

| Link | Interface | For | What they do |
|---|---|---|---|
| `#pm` | **Task Creation** (blue) | Product managers | Build a request: 4E line, product (options depend on the line), project name, master task title, priority, brief, then one or more detailed subtasks, each with its own start, end and hours, shown on a live timeline. PMs don't choose designers; the owner assigns every subtask. Submit to the owner, save a draft, and follow each request's status and, once approved, its live progress. |
| `#designer` | **Designer Tracker** (orange) | Product designers | Only their own approved tasks and a personal timeline. Post one update per task per day (status, progress, hours, revision rounds, note, blocker) and log leave weekly. |
| `#owner` | **Owner Dashboard** (gold on ebony) | The owner only | Task funnel (approve, send back with a note, or reject; adjust designers and dates first, with a capacity check), overview dashboard, all tasks, leave, people and access, lists and 4E setup, Excel export. |

Opening another group's link shows a short "this page is for ..." notice.

## Role based access by official ID

Everyone signs in with their official email and a password. Accounts outside
the company domain are refused, and nobody sees anything until they confirm
their email. Under **People & access** the owner invites a person by email,
picks their **Role** from a dropdown (product manager or product designer) and
their name on the tracker. When that person creates their account with the
invited email they land in their own interface. Someone who was not invited
can send an access request, which the owner approves or declines. The owner
can change a role or remove access from the Members table at any time, and
every change is kept in **Access history** with the last sign-in per person.

The roles are enforced by Firestore security rules on the server
(`firebase/firestore.rules`): a designer can only read their own tasks and
write their own progress and leave, a PM only their own requests and the tasks
that came from them, and only the owner can approve work, manage people or
change the lists. The owner account is fixed by email at build time.

## Sign in and sign out

Sign-in, account creation, email confirmation and password reset pages, with
a show/hide password toggle, a strong password rule (10+ characters, upper and
lower case, a number and a symbol), the same answer for a wrong email or wrong
password, and a reset form that never reveals whether an account exists.
"Keep me signed in" is off by default; without it the session ends with the
browser or after 30 minutes of inactivity (with a warning two minutes before).
Signing out warns about unsaved changes and clears anything typed from the
device. Account settings in the account menu change the name and password.

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

A solid brand top bar (logo, interface name, search, alerts, account) and an
icon rail on the left with a short label under each icon; on phones the rail
becomes a bottom dock. Content sits on a soft lavender background as white
cards with one 16 px gap and one page margin everywhere. Each page opens with
a title and a row of summary tiles (icon, label, figure), cards carry a
"View all" link where there is more, and the Owner overview has a Quick
actions list. Set in Plus Jakarta Sans; chart colours are purple, orange,
lavender, red and olive, checked for colour-blind separation, with a dark
theme that follows the system setting.

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
npm run build            # dist-web/ (the site) and firebase/firestore.rules
npm test                 # export structure + Excel-vs-app formula parity
npm run test:rules       # security rules against the Firestore emulator
npm run test:ui          # browser walk-through with an in-memory backend
npm run deploy           # build, then deploy hosting and rules (see DEPLOY.md)
```

The parity test recalculates a 60-task workbook in LibreOffice and compares
every auto-calculated Tracker column, the Scorecard and the weekly workload
with `metrics.js`. It needs LibreOffice Calc and `RECALC=<path to recalc.py>`;
without them it is skipped.

The UI test (`tests/ui.smoke.js`, with `tests/mock-platform.js` in place of
Firebase) walks sign up, email confirmation, invitations and role changes,
wrong password, reset, keep me signed in, unsaved-changes sign-out, password
change, idle sign-out, and the request, funnel, batch, designer and export
flows. It also checks that every interface keeps the same page margins at
desktop, tablet and phone widths with no sideways scrolling.

## Code

- `app/index.src.html`: styles and page shell. `app/app.js`: all three
  interfaces. `app/metrics.js`: the workbook formulas. `app/export.js`: the
  Excel export.
- `app/platform.firebase.js`: the only file that talks to Firebase (auth and
  database), published as `platform.js`.
- `web/firebase-config.js`: project keys, owner email and company domain.
- `firebase/`: hosting config with security headers, and the rules template.
- `tools/build_web.js`: builds the site and the rules.

## Data

Firestore collections, and who may write each one (enforced by the rules):

| Path | Written by | Holds |
|---|---|---|
| `members/<uid>` | Owner (the person may only change their display name) | Role, name on the tracker, email |
| `invites/<email>` | Owner | Pending invitations with role and tracker name |
| `claims/<uid>` | That person | Access request |
| `config/main` | Owner | Designers, PMs, projects with lead PM, 4E lines with products, subtask types, holidays, scoring |
| `requests/<uid>/items/*` | That PM (the owner reads and decides) | Requests with their subtasks and decision history |
| `tasks/*` | Owner (on approval) | Approved tasks, one per subtask |
| `progress/<uid>/tasks/*` | That designer, for their own tasks | Status, progress, revisions, blockers, batch items and daily updates |
| `leave/<uid>`, `leave/<uid>/items/*` | That designer | Weekly leave confirmations and leave entries |
| `sessions/<uid>` | That person (owner reads) | Recent sign-ins and sign-outs |
| `audit/log` | Owner | Access history |
