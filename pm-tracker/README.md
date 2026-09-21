# PM Task Tracker

A single-file web app for tracking the work assigned to product managers: product development, product improvements, and client work such as custom simulations, coaching programs and role-plays.

Every task records a **start date and an end date**, an **owner**, a **checklist of subtasks**, and **dependencies** on other tasks.

The main view is a **Board** with Backlog, To Do, In Progress, Review and Complete columns. Cards show the product or type, client, priority (P1 highlighted), a segmented checklist bar, the date range with due, late-start or blocked badges, and the owner. Drag a card to another column to change status, or use the card menu. Clicking a card opens a detail drawer with a weekly update box, checklist, dependencies, blocked reason and the full activity log.

The **Weekly Report** tab builds the report for any week: completed, in progress, slipped or late, blocked, due next week, new this week and backlog, with the weekly updates written that week. It can be grouped by PM, copied as text, printed or exported as CSV.

**List** and **Timeline** show the same tasks as a table and as bars between start and end dates. The sidebar filters by work type, 4E product line, status, attention (overdue, due in 7 days, blocked, waiting on others) and team member. Owners are picked from a team roster managed in the sidebar.

## Using it

- **Published board (shared).** When the page is published as a Claude artifact with the `db` capability, tasks live in the artifact's shared database and every PM with access sees the same live board.
- **Standalone (this file).** Open `index.html` in a browser. Tasks are then saved in that browser's local storage only.

The first time the board is empty it offers to load example tasks. They are marked "Example" and can be removed in one click.

## Task fields

| Field | Notes |
| --- | --- |
| Task | Short name of the work |
| Type | Product development, Product improvement, Product task, Custom simulation, Coaching, Role-play, Client task |
| Product | Optional. One of the 4E product lines: Evaluate (Conversation AI, Nano AI, PitchPerfect AI), Educate (AI Microlearn, Interactive Learn), Experience (Simulations, AI RolePlay), Enable (AI Koach) |
| Client | Optional. Blank for internal work |
| Owner | The PM responsible |
| Status | Backlog, To Do, In Progress, Review, Complete. Drag a card between columns to change it |
| Priority | P1 urgent, P2 normal, P3 low |
| Blocked | Optional flag with a reason and the date it was set, independent of status |
| Weekly updates | Short notes per task, pulled into the Weekly Report for the week they were written |
| Activity | Automatic log of status, date, owner, checklist and blocked changes with time and actor |
| Start and end date | Required unless the task is in Backlog. The first scheduled end date is kept so slippage can be reported |
| Checklist | Subtasks, each with a done checkbox |
| Depends on | Other tasks that must finish first. Circular dependencies are prevented |
| Notes | Free text |

## Data model

One document per task in the `tasks` collection, plus `settings/team` holding `{ "members": ["Asha Menon", ...] }`:

```json
{
  "title": "Nano AI: adaptive question bank v2",
  "kind": "product-dev",
  "product": "Nano AI",
  "client": "",
  "owner": "Asha",
  "status": "in_progress",
  "priority": 2,
  "endOriginal": "2026-10-09",
  "blocked": null,
  "updates": [{ "at": "2026-09-21T10:00:00.000Z", "by": "<viewer id>", "text": "Beta bank half built." }],
  "activity": [{ "at": "2026-09-21T10:00:00.000Z", "by": "<viewer id>", "type": "status", "text": "Moved from To Do to In Progress" }],
  "completedAt": null,
  "start": "2026-09-11",
  "end": "2026-10-09",
  "notes": "",
  "subtasks": [{ "id": "s_x", "text": "Write PRD", "done": true }],
  "dependsOn": ["t_otherTaskId"],
  "createdAt": "2026-09-21T09:00:00.000Z",
  "updatedAt": "2026-09-21T09:00:00.000Z"
}
```

No build step and no dependencies. Fonts load from Google Fonts with a system fallback.
