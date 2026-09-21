# PM Task Tracker

A single-file web app for tracking the work assigned to product managers: product development, product improvements, and client work such as custom simulations, coaching programs and role-plays.

Every task records a **start date and an end date**, an **owner**, a **checklist of subtasks**, and **dependencies** on other tasks.

The main view is a **Kanban board** with To Do, In Progress, Review and Complete columns. Cards show tags, a description, a segmented checklist progress bar, the date range with a due badge, the owner avatar and dependency counts. Drag a card to another column to change its status, or use the card menu. Clicking a card opens a detail drawer with the checklist, dependencies and what the task blocks. The sidebar filters by work type, 4E product line, status, attention (overdue, due in 7 days, waiting on others) and team member. **List** and **Timeline** views show the same tasks as a table and as bars between start and end dates.

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
| Status | To Do, In Progress, Review, Complete. Drag a card between Kanban columns to change it |
| Start and end date | Required |
| Checklist | Subtasks, each with a done checkbox |
| Depends on | Other tasks that must finish first. Circular dependencies are prevented |
| Notes | Free text |

## Data model

One document per task in the `tasks` collection:

```json
{
  "title": "Nano AI: adaptive question bank v2",
  "kind": "product-dev",
  "product": "Nano AI",
  "client": "",
  "owner": "Asha",
  "status": "in_progress",
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
