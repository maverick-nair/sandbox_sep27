# KNOLSKAPE PM Desk

A single-file web app for tracking the work assigned to product managers: product development, product improvements, and client work such as custom simulations, coaching programs and role-plays.

Every task records a **start date and an end date**, an **owner**, a **checklist of subtasks**, and **dependencies** on other tasks.

The main view is a **Board** with Backlog, To Do, In Progress, Review and Complete columns. Cards show the product or type, client, priority (P1 highlighted), a segmented checklist bar, the date range with due, late-start or blocked badges, and the owner. Drag a card to another column to change status, or use the card menu. Clicking a card opens a detail drawer with a weekly update box, checklist, dependencies, blocked reason and the full activity log.

The **Weekly Report** tab builds the report for any week: completed, in progress, slipped or late, blocked, due next week, new this week and backlog, with the weekly updates written that week. It can be grouped by PM, copied as text, printed or exported as CSV.

**List** and **Timeline** show the same tasks as a table and as bars between start and end dates. The sidebar holds only the work streams (all, product and platform, client programs) and the PM team. A status card above the task list shows counts for each status and for attention items (overdue, due in 7 days, blocked, waiting on others, recently deleted), and each count is a one-click filter. The 4E product or GENIE pillar filter lives in the Filter popover. Owners are picked from a team roster managed in the sidebar.

## Using it

- **Published board (shared).** When the page is published as a Claude artifact with the `db` capability, tasks live in the artifact's shared database and every PM with access sees the same live board.
- **Standalone (this file).** Open `index.html` in a browser. Tasks are then saved in that browser's local storage only.

The first time the board is empty it offers to load example tasks. They are marked "Example" and can be removed in one click.

## Task fields

| Field | Notes |
| --- | --- |
| Task | Short name of the work |
| Work type | Product and platform: 4E product development, 4E product enhancement, GENIE platform, Passport catalogue. Client programs: Custom Sim build, Assessment deployment, AI Roleplay build, AI Koach program, Learning Journey design, VAC delivery, ILT / VILT / TTT delivery, Sim localisation, Other client ask |
| 4E product or GENIE pillar | Optional. Evaluate: Conversation AI, Nano AI, PitchPerfect AI. Educate: AI Microlearn, Interactive Learn. Experience: Simulations, AI RolePlay. Enable: AI Koach. GENIE platform: GenieKreator, GenieOrchestrator, GenieTracker, AktivLearn+ |
| Client account | Optional. Blank for internal product work |
| Owner (PM) | Picked from the PM team roster |
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
  "kind": "4e-dev",
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

## Accessibility and quality

Audited with axe-core against WCAG 2.2 AA on phone, tablet, laptop and desktop widths in light and dark themes. Colour tokens meet 4.5:1 for text and 3:1 for the progress track. The task drawer is a modal dialog with focus trapping and focus return, the card menu is keyboard navigable, tabs use proper tab roles, form errors are announced, and every card, list row, report line and timeline bar is a real button. Drag and drop always has a menu or dropdown alternative.

Writes to the shared database send only changed fields, so two PMs editing different parts of one task no longer overwrite each other. Deleting a task is a soft delete with Undo. Deleted tasks sit under Recently deleted for 30 days and can be restored or removed permanently. Text being typed in the drawer survives live updates from other viewers.

No build step and no dependencies. Fonts load from Google Fonts with a system fallback.
